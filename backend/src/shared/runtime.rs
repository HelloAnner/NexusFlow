async fn healthz() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn readyz(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ApiError> {
    let db_ok = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();
    let redis_ok = if let Some(conn) = &state.redis {
        let mut conn = conn.lock().await;
        redis::cmd("PING")
            .query_async::<String>(&mut *conn)
            .await
            .is_ok()
    } else {
        false
    };
    let s3_ok = state.config.s3_endpoint.is_some() && state.config.s3_bucket.is_some();
    Ok(Json(json!({
        "status": if db_ok && (state.config.env != "production" || redis_ok) { "ready" } else { "degraded" },
        "database": db_ok,
        "redis": redis_ok,
        "redis_key_prefix": state.config.redis_key_prefix,
        "s3_configured": s3_ok,
        "s3_region": state.config.s3_region,
        "s3_credentials_configured": state.config.s3_access_key.is_some() && state.config.s3_secret_key.is_some(),
        "port": state.config.port,
        "search_backend": state.config.search_backend,
        "uptime_seconds": (Utc::now() - state.started_at).num_seconds()
    })))
}

async fn bootstrap(db: &PgPool) -> Result<(), sqlx::Error> {
    let sa_role_id: Uuid = sqlx::query_scalar("SELECT id FROM roles WHERE code = 'sa'")
        .fetch_one(db)
        .await?;
    let org_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO organizations(name, code, org_type, path)
         VALUES ('NexusFlow', 'ROOT', 'company', '/ROOT')
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id",
    )
    .fetch_one(db)
    .await?;

    let account_id = if let Some(id) =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM accounts WHERE login_name = 'Anner'")
            .fetch_optional(db)
            .await?
    {
        id
    } else {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO accounts(login_name, password_hash, status)
             VALUES ('Anner', $1, 'enabled') RETURNING id",
        )
        .bind(hash_password("1"))
        .fetch_one(db)
        .await?
    };

    let person_id = if let Some(id) =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM persons WHERE account_id = $1")
            .bind(account_id)
            .fetch_optional(db)
            .await?
    {
        id
    } else {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO persons(name, account_id, primary_org_id, system_role_ids, work_status, account_status, dispatch_enabled)
             VALUES ('Anner', $1, $2, $3, 'active', 'enabled', true) RETURNING id",
        )
        .bind(account_id)
        .bind(org_id)
        .bind(vec![sa_role_id])
        .fetch_one(db)
        .await?
    };

    sqlx::query("UPDATE accounts SET person_id = $1, status = 'enabled' WHERE id = $2")
        .bind(person_id)
        .bind(account_id)
        .execute(db)
        .await?;
    Ok(())
}

async fn load_current_user(db: &PgPool, account_id: Uuid) -> Result<CurrentUser, ApiError> {
    let row = sqlx::query(
        "SELECT a.id, a.login_name, a.status, a.person_id, COALESCE(p.system_role_ids, '{}') AS role_ids
         FROM accounts a
         LEFT JOIN persons p ON p.id = a.person_id
         WHERE a.id = $1 AND a.deleted_at IS NULL",
    )
    .bind(account_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| ApiError::Unauthorized { message: "account not found".to_string() })?;

    let role_ids: Vec<Uuid> = row.try_get("role_ids")?;
    let mut role_codes = Vec::new();
    let mut actions = HashSet::new();
    if !role_ids.is_empty() {
        let rows = sqlx::query("SELECT id, code FROM roles WHERE id = ANY($1) AND enabled = true")
            .bind(&role_ids)
            .fetch_all(db)
            .await?;
        let enabled_role_ids: Vec<Uuid> = rows.iter().map(|r| r.get("id")).collect();
        role_codes = rows.iter().map(|r| r.get::<String, _>("code")).collect();
        if !enabled_role_ids.is_empty() {
            for row in sqlx::query("SELECT action_code FROM role_actions WHERE role_id = ANY($1)")
                .bind(&enabled_role_ids)
                .fetch_all(db)
                .await?
            {
                actions.insert(row.get::<String, _>("action_code"));
            }
        }
    }

    Ok(CurrentUser {
        account_id: row.get("id"),
        person_id: row.try_get("person_id").ok(),
        login_name: row.get("login_name"),
        account_status: row.get("status"),
        role_ids,
        role_codes,
        actions,
    })
}

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"nexusflow-password-v1:");
    hasher.update(password.as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

fn verify_password(raw: &str, stored: &str) -> bool {
    if let Some(plain) = stored.strip_prefix("plain:") {
        raw == plain
    } else {
        hash_password(raw) == stored
    }
}

fn random_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn hash_token(secret: &str, token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hasher.update(b":");
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn value_str(payload: &Value, key: &str, default: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(default)
        .to_string()
}

fn value_uuid(payload: &Value, key: &str) -> Option<Uuid> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .and_then(|v| Uuid::parse_str(v).ok())
}

fn value_uuid_vec(payload: &Value, key: &str) -> Vec<Uuid> {
    payload
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .filter_map(|v| Uuid::parse_str(v).ok())
                .collect()
        })
        .unwrap_or_default()
}

fn value_bool(payload: &Value, key: &str, default: bool) -> bool {
    payload.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn value_f64(payload: &Value, key: &str, default: f64) -> f64 {
    payload.get(key).and_then(Value::as_f64).unwrap_or(default)
}

fn value_i64(payload: &Value, key: &str, default: i64) -> i64 {
    payload.get(key).and_then(Value::as_i64).unwrap_or(default)
}

fn parse_date(payload: &Value, key: &str) -> Option<NaiveDate> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
}

fn parse_datetime(payload: &Value, key: &str) -> Option<DateTime<Utc>> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc))
}

fn json_row(row: &sqlx::postgres::PgRow, alias: &str) -> Result<Value, sqlx::Error> {
    row.try_get::<Value, _>(alias)
}

async fn emit_event(
    db: &PgPool,
    event_type: &str,
    object_type: &str,
    object_id: Option<Uuid>,
    actor_id: Option<Uuid>,
    payload: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO domain_events(event_type, object_type, object_id, actor_id, payload)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(event_type)
    .bind(object_type)
    .bind(object_id)
    .bind(actor_id)
    .bind(payload)
    .execute(db)
    .await?;
    Ok(())
}

async fn audit(
    db: &PgPool,
    actor_id: Option<Uuid>,
    object_type: &str,
    object_id: Option<Uuid>,
    action: &str,
    before_payload: Value,
    after_payload: Value,
    reason: &str,
    headers: Option<&HeaderMap>,
) -> Result<(), sqlx::Error> {
    let request_id = headers
        .and_then(|h| h.get("x-request-id"))
        .and_then(|h| h.to_str().ok())
        .map(str::to_string);
    let source_ip = headers
        .and_then(|h| h.get("x-forwarded-for"))
        .and_then(|h| h.to_str().ok())
        .map(str::to_string);
    sqlx::query(
        "INSERT INTO audit_logs(actor_id, object_type, object_id, action, before_payload, after_payload, reason, request_id, source_ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(actor_id)
    .bind(object_type)
    .bind(object_id)
    .bind(action)
    .bind(before_payload)
    .bind(after_payload)
    .bind(reason)
    .bind(request_id)
    .bind(source_ip)
    .execute(db)
    .await?;
    Ok(())
}
