async fn list_invitation_templates(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let rows = sqlx::query("SELECT to_jsonb(invitation_templates.*) AS item FROM invitation_templates ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_invitation_template(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO invitation_templates(name, invite_type, default_org_id, default_role_ids, default_project_id, default_project_role, default_work_desc, need_approval, reviewer_source, required_fields, expires_in_days, max_uses, status, payload, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id",
    )
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "invite_type", "user"))
    .bind(value_uuid(&payload, "default_org_id"))
    .bind(value_uuid_vec(&payload, "default_role_ids"))
    .bind(value_uuid(&payload, "default_project_id"))
    .bind(payload.get("default_project_role").and_then(Value::as_str))
    .bind(value_str(&payload, "default_work_desc", ""))
    .bind(value_bool(&payload, "need_approval", true))
    .bind(value_str(&payload, "reviewer_source", "default_org"))
    .bind(payload.get("required_fields").cloned().unwrap_or_else(|| json!([])))
    .bind(value_i64(&payload, "expires_in_days", 7) as i32)
    .bind(value_i64(&payload, "max_uses", 1) as i32)
    .bind(value_str(&payload, "status", "enabled"))
    .bind(payload.clone())
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "invitation_template",
        Some(id),
        "invitation_template.created",
        json!({}),
        payload,
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_invitation_template(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    sqlx::query(
        "UPDATE invitation_templates SET name = COALESCE($2, name), status = COALESCE($3, status), default_org_id = COALESCE($4, default_org_id),
         default_role_ids = COALESCE($5, default_role_ids), default_project_id = COALESCE($6, default_project_id), need_approval = COALESCE($7, need_approval),
         required_fields = COALESCE($8, required_fields), expires_in_days = COALESCE($9, expires_in_days), max_uses = COALESCE($10, max_uses),
         payload = payload || $11, updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("status").and_then(Value::as_str))
    .bind(value_uuid(&payload, "default_org_id"))
    .bind(if payload.get("default_role_ids").is_some() { Some(value_uuid_vec(&payload, "default_role_ids")) } else { None })
    .bind(value_uuid(&payload, "default_project_id"))
    .bind(payload.get("need_approval").and_then(Value::as_bool))
    .bind(payload.get("required_fields").cloned())
    .bind(payload.get("expires_in_days").and_then(Value::as_i64).map(|v| v as i32))
    .bind(payload.get("max_uses").and_then(Value::as_i64).map(|v| v as i32))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "invitation_template",
        Some(id),
        "invitation_template.updated",
        json!({}),
        payload,
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn create_invitation_link(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let row = sqlx::query(
        "SELECT expires_in_days, max_uses, status FROM invitation_templates WHERE id = $1",
    )
    .bind(template_id)
    .fetch_one(&state.db)
    .await?;
    let status: String = row.get("status");
    if status != "enabled" {
        return Err(ApiError::conflict("invitation template is not enabled"));
    }
    let expires_in_days: i32 = row.get("expires_in_days");
    let max_uses: i32 = row.get("max_uses");
    let token = random_token();
    let token_hash = hash_token(&state.config.session_secret, &token);
    let expires_at = Utc::now() + Duration::days(expires_in_days as i64);
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO invitation_links(template_id, token_hash, expires_at, max_uses, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(template_id)
    .bind(token_hash)
    .bind(expires_at)
    .bind(max_uses)
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;
    emit_event(
        &state.db,
        "invitation.created",
        "invitation_link",
        Some(id),
        user.person_id,
        json!({ "template_id": template_id }),
    )
    .await?;
    Ok(Json(json!({
        "id": id,
        "token": token,
        "url": format!("{}/register/invitation/{}", state.config.public_url.trim_end_matches('/'), token),
        "expires_at": expires_at,
        "max_uses": max_uses
    })))
}

async fn list_invitation_links(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object('id', id, 'template_id', template_id, 'expires_at', expires_at, 'max_uses', max_uses, 'used_count', used_count, 'status', status, 'created_by', created_by, 'created_at', created_at) AS item
         FROM invitation_links ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn disable_invitation_link(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    sqlx::query("UPDATE invitation_links SET status = 'disabled' WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "invitation.disabled",
        "invitation_link",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "disabled" })))
}

async fn get_invitation_token(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let token_hash = hash_token(&state.config.session_secret, &token);
    let row = sqlx::query(
        "SELECT il.id, il.expires_at, il.max_uses, il.used_count, il.status, to_jsonb(it.*) AS template
         FROM invitation_links il JOIN invitation_templates it ON it.id = il.template_id
         WHERE il.token_hash = $1",
    )
    .bind(token_hash)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("invitation token not found"))?;
    let status: String = row.get("status");
    let expires_at: DateTime<Utc> = row.get("expires_at");
    let used_count: i32 = row.get("used_count");
    let max_uses: i32 = row.get("max_uses");
    if status != "enabled" || expires_at < Utc::now() || used_count >= max_uses {
        return Err(ApiError::conflict(
            "invitation token is expired or exhausted",
        ));
    }
    Ok(Json(json!({
        "id": row.get::<Uuid, _>("id"),
        "expires_at": expires_at,
        "remaining_uses": max_uses - used_count,
        "template": row.get::<Value, _>("template")
    })))
}

async fn register_by_invitation(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let token_hash = hash_token(&state.config.session_secret, &token);
    let mut tx = state.db.begin().await?;
    let row = sqlx::query(
        "SELECT il.id AS link_id, il.used_count, il.max_uses, il.expires_at, il.status AS link_status,
          it.default_org_id, it.default_role_ids, it.default_project_id, it.default_project_role, it.default_work_desc, it.need_approval, it.status AS template_status
         FROM invitation_links il JOIN invitation_templates it ON it.id = il.template_id
         WHERE il.token_hash = $1 FOR UPDATE",
    )
    .bind(token_hash)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::not_found("invitation token not found"))?;
    let expires_at: DateTime<Utc> = row.get("expires_at");
    let link_status: String = row.get("link_status");
    let template_status: String = row.get("template_status");
    let used_count: i32 = row.get("used_count");
    let max_uses: i32 = row.get("max_uses");
    if link_status != "enabled"
        || template_status != "enabled"
        || expires_at < Utc::now()
        || used_count >= max_uses
    {
        return Err(ApiError::conflict(
            "invitation token is expired or exhausted",
        ));
    }
    let login_name = value_str(&payload, "login_name", "");
    let password = value_str(&payload, "password", "");
    let name = value_str(&payload, "name", &login_name);
    if login_name.is_empty() || password.is_empty() || name.is_empty() {
        return Err(ApiError::bad_request(
            "login_name, password and name are required",
        ));
    }
    let need_approval: bool = row.get("need_approval");
    let account_status = if need_approval { "pending" } else { "enabled" };
    let account_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO accounts(login_name, password_hash, status, payload) VALUES ($1,$2,$3,$4) RETURNING id",
    )
    .bind(&login_name)
    .bind(hash_password(&password))
    .bind(account_status)
    .bind(payload.clone())
    .fetch_one(&mut *tx)
    .await?;
    let default_org_id: Option<Uuid> = row.try_get("default_org_id").ok();
    let role_ids: Vec<Uuid> = row.get("default_role_ids");
    let person_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO persons(name, account_id, primary_org_id, system_role_ids, work_status, account_status, payload)
         VALUES ($1,$2,$3,$4,'active',$5,$6) RETURNING id",
    )
    .bind(name)
    .bind(account_id)
    .bind(default_org_id)
    .bind(role_ids)
    .bind(account_status)
    .bind(payload.clone())
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("UPDATE accounts SET person_id = $1 WHERE id = $2")
        .bind(person_id)
        .bind(account_id)
        .execute(&mut *tx)
        .await?;
    if let Some(org_id) = default_org_id {
        sqlx::query("INSERT INTO person_org_memberships(person_id, org_id, membership_type) VALUES ($1,$2,'primary') ON CONFLICT DO NOTHING")
            .bind(person_id)
            .bind(org_id)
            .execute(&mut *tx)
            .await?;
    }
    let link_id: Uuid = row.get("link_id");
    let registration_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO registration_requests(invitation_link_id, account_id, person_id, payload, status)
         VALUES ($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(link_id)
    .bind(account_id)
    .bind(person_id)
    .bind(payload.clone())
    .bind(if need_approval { "pending" } else { "approved" })
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("UPDATE invitation_links SET used_count = used_count + 1 WHERE id = $1")
        .bind(link_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    emit_event(
        &state.db,
        "registration.submitted",
        "registration_request",
        Some(registration_id),
        Some(person_id),
        payload,
    )
    .await?;
    Ok(Json(
        json!({ "registration_id": registration_id, "account_id": account_id, "person_id": person_id, "status": if need_approval { "pending" } else { "approved" } }),
    ))
}

async fn list_registrations(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let rows = sqlx::query("SELECT to_jsonb(registration_requests.*) AS item FROM registration_requests ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn approve_registration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let row = sqlx::query("SELECT account_id, person_id FROM registration_requests WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let account_id: Option<Uuid> = row.try_get("account_id").ok();
    let person_id: Option<Uuid> = row.try_get("person_id").ok();
    sqlx::query("UPDATE registration_requests SET status = 'approved', reviewer_id = $2, review_comment = $3, reviewed_at = now() WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    if let Some(account_id) = account_id {
        sqlx::query("UPDATE accounts SET status = 'enabled' WHERE id = $1")
            .bind(account_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(person_id) = person_id {
        sqlx::query("UPDATE persons SET account_status = 'enabled' WHERE id = $1")
            .bind(person_id)
            .execute(&state.db)
            .await?;
    }
    emit_event(
        &state.db,
        "registration.approved",
        "registration_request",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "approved" })))
}

async fn reject_registration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    sqlx::query("UPDATE registration_requests SET status = 'rejected', reviewer_id = $2, review_comment = $3, reviewed_at = now() WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "registration.rejected",
        "registration_request",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "rejected" })))
}

async fn admin_dashboard(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let pending_registrations: i64 =
        sqlx::query_scalar("SELECT count(*) FROM registration_requests WHERE status = 'pending'")
            .fetch_one(&state.db)
            .await?;
    let enabled_accounts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM accounts WHERE status = 'enabled'")
            .fetch_one(&state.db)
            .await?;
    let open_conflicts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open'")
            .fetch_one(&state.db)
            .await?;
    Ok(Json(
        json!({ "pending_registrations": pending_registrations, "enabled_accounts": enabled_accounts, "open_conflicts": open_conflicts }),
    ))
}

async fn list_accounts(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object('id', id, 'login_name', login_name, 'person_id', person_id, 'status', status, 'last_login_at', last_login_at, 'failed_login_count', failed_login_count, 'created_at', created_at) AS item
         FROM accounts WHERE deleted_at IS NULL ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn disable_account(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    sqlx::query("UPDATE accounts SET status = 'disabled', updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "account.disabled",
        "account",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "disabled" })))
}

async fn unlock_account(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    sqlx::query("UPDATE accounts SET status = 'enabled', failed_login_count = 0, updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "status": "enabled" })))
}
