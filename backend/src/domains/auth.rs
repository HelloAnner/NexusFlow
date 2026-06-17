async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let login_name = value_str(&payload, "login_name", "");
    let password = value_str(&payload, "password", "");
    if login_name.is_empty() || password.is_empty() {
        return Err(ApiError::bad_request(
            "login_name and password are required",
        ));
    }
    let row = sqlx::query("SELECT id, password_hash, status, failed_login_count FROM accounts WHERE login_name = $1 AND deleted_at IS NULL")
        .bind(&login_name)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::Unauthorized { message: "invalid credentials".to_string() })?;
    let account_id: Uuid = row.get("id");
    let status: String = row.get("status");
    if status == "disabled" || status == "locked" {
        return Err(ApiError::forbidden("account is disabled or locked"));
    }
    let password_hash: String = row.get("password_hash");
    if !verify_password(&password, &password_hash) {
        let failed: i32 = row.get("failed_login_count");
        let new_failed = failed + 1;
        let new_status = if new_failed >= 5 { "locked" } else { &status };
        sqlx::query("UPDATE accounts SET failed_login_count = $1, status = $2, updated_at = now() WHERE id = $3")
            .bind(new_failed)
            .bind(new_status)
            .bind(account_id)
            .execute(&state.db)
            .await?;
        return Err(ApiError::Unauthorized {
            message: "invalid credentials".to_string(),
        });
    }

    let token = random_token();
    let token_hash = hash_token(&state.config.session_secret, &token);
    let expires_at = Utc::now() + Duration::days(7);
    sqlx::query("INSERT INTO sessions(account_id, token_hash, expires_at) VALUES ($1, $2, $3)")
        .bind(account_id)
        .bind(token_hash)
        .bind(expires_at)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE accounts SET last_login_at = now(), failed_login_count = 0, updated_at = now() WHERE id = $1")
        .bind(account_id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "auth.login",
        "account",
        Some(account_id),
        None,
        json!({ "login_name": login_name }),
    )
    .await?;
    let user = load_current_user(&state.db, account_id).await?;
    Ok(Json(
        json!({ "token": token, "expires_at": expires_at, "user": user }),
    ))
}

async fn logout(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    sqlx::query(
        "UPDATE sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
    )
    .bind(user.account_id)
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "auth.logout",
        "account",
        Some(user.account_id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn auth_me(user: CurrentUser) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "user": user })))
}

async fn permissions_me(user: CurrentUser) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({
        "account_id": user.account_id,
        "person_id": user.person_id,
        "roles": user.role_codes,
        "actions": user.actions,
        "pending": user.is_pending()
    })))
}

async fn permission_check(
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let action = value_str(&payload, "action", "");
    let allowed = user.is_sa() || user.actions.contains(&action);
    Ok(Json(json!({ "allowed": allowed, "action": action })))
}
