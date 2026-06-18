async fn dashboard(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    let role = if user.is_sa() {
        "sa"
    } else {
        user.role_codes
            .first()
            .map(String::as_str)
            .unwrap_or("employee")
    };
    let todo_count: i64 = if let Some(person_id) = user.person_id {
        sqlx::query_scalar(
            "SELECT count(*) FROM todo_items WHERE assignee_id = $1 AND status = 'open'",
        )
        .bind(person_id)
        .fetch_one(&state.db)
        .await?
    } else {
        0
    };
    let task_count: i64 = if let Some(person_id) = user.person_id {
        sqlx::query_scalar("SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND (owner_id = $1 OR initiator_id = $1 OR acceptor_id = $1)")
            .bind(person_id)
            .fetch_one(&state.db)
            .await?
    } else {
        0
    };
    let conflict_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open'")
            .fetch_one(&state.db)
            .await?;
    Ok(Json(json!({
        "role": role,
        "available_roles": user.role_codes,
        "layout": {},
        "widgets": {
            "todos": { "count": todo_count },
            "my_tasks": { "count": task_count },
            "conflicts": { "count": conflict_count }
        },
        "quick_actions": [],
        "permissions": user.actions
    })))
}

async fn dashboard_widgets(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    dashboard(State(state), user).await
}

async fn dashboard_role_entry(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    let role_id = user.role_ids.first().copied();
    let item = if let Some(role_id) = role_id {
        sqlx::query("SELECT to_jsonb(role_entry_configs.*) AS item FROM role_entry_configs WHERE role_id = $1")
            .bind(role_id)
            .fetch_optional(&state.db)
            .await?
            .map(|r| json_row(&r, "item"))
            .transpose()?
    } else {
        None
    };
    Ok(Json(
        json!({ "entry": item.unwrap_or_else(|| json!({ "default_home": if user.is_sa() { "/admin" } else { "/dashboard" } })) }),
    ))
}

async fn dashboard_role_view(
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let role = value_str(&payload, "role", "");
    if !user.role_codes.contains(&role) && !user.is_sa() {
        return Err(ApiError::forbidden("role view is not available"));
    }
    Ok(Json(json!({ "role": role })))
}

fn default_branding() -> Value {
    json!({
        "product_name": "NexusFlow",
        "system_name": "NexusFlow"
    })
}

fn normalize_branding_payload(payload: &Value) -> Result<Value, ApiError> {
    let product_name = value_str(payload, "product_name", "NexusFlow")
        .trim()
        .to_string();
    let system_name = value_str(payload, "system_name", product_name.as_str())
        .trim()
        .to_string();

    if product_name.is_empty() || system_name.is_empty() {
        return Err(ApiError::bad_request(
            "product_name and system_name are required",
        ));
    }
    if product_name.chars().count() > 40 || system_name.chars().count() > 60 {
        return Err(ApiError::bad_request(
            "product_name must be <= 40 chars and system_name must be <= 60 chars",
        ));
    }

    Ok(json!({
        "product_name": product_name,
        "system_name": system_name,
    }))
}

async fn system_branding(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ApiError> {
    let payload = sqlx::query_scalar::<_, Value>(
        "SELECT payload FROM config_versions
         WHERE namespace = 'branding' AND status = 'published'
         ORDER BY version_no DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?
    .unwrap_or_else(default_branding);

    Ok(Json(json!({ "branding": normalize_branding_payload(&payload)? })))
}

async fn recent_activities(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(domain_events.*) AS item FROM domain_events ORDER BY created_at DESC LIMIT 50")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn config_modules(user: CurrentUser) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    Ok(Json(json!({
        "modules": ["task_template", "approval_rule", "alert_rule", "view_config", "tool_config", "invitation_policy", "role_entry"]
    })))
}

async fn get_config(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let item = sqlx::query(
        "SELECT to_jsonb(config_versions.*) AS item FROM config_versions
         WHERE namespace = $1 AND status = 'published'
         ORDER BY version_no DESC LIMIT 1",
    )
    .bind(namespace)
    .fetch_optional(&state.db)
    .await?
    .map(|r| json_row(&r, "item"))
    .transpose()?;
    Ok(Json(json!({ "config": item })))
}

async fn save_config_draft(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("config.publish")?;
    let payload = if namespace == "branding" {
        normalize_branding_payload(&payload)?
    } else {
        payload
    };
    let next_no: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version_no), 0) + 1 FROM config_versions WHERE namespace = $1",
    )
    .bind(&namespace)
    .fetch_one(&state.db)
    .await?;
    let id = sqlx::query_scalar::<_, Uuid>("INSERT INTO config_versions(namespace, version_no, status, payload, created_by) VALUES ($1,$2,'draft',$3,$4) RETURNING id")
        .bind(&namespace)
        .bind(next_no)
        .bind(payload.clone())
        .bind(user.person_id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(
        json!({ "id": id, "namespace": namespace, "version_no": next_no, "status": "draft" }),
    ))
}

async fn publish_config(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("config.publish")?;
    let id = value_uuid(&payload, "id").ok_or_else(|| ApiError::bad_request("id is required"))?;
    if namespace == "branding" {
        let config_payload: Value =
            sqlx::query_scalar("SELECT payload FROM config_versions WHERE id = $1 AND namespace = $2")
                .bind(id)
                .bind(&namespace)
                .fetch_one(&state.db)
                .await?;
        let normalized = normalize_branding_payload(&config_payload)?;
        sqlx::query("UPDATE config_versions SET payload = $2 WHERE id = $1")
            .bind(id)
            .bind(normalized)
            .execute(&state.db)
            .await?;
    }
    sqlx::query("UPDATE config_versions SET status = 'disabled' WHERE namespace = $1 AND status = 'published'")
        .bind(&namespace)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE config_versions SET status = 'published', published_by = $2, published_at = now() WHERE id = $1 AND namespace = $3")
        .bind(id)
        .bind(user.person_id)
        .bind(&namespace)
        .execute(&state.db)
        .await?;
    if namespace == "role_entry" {
        let config_payload: Value =
            sqlx::query_scalar("SELECT payload FROM config_versions WHERE id = $1")
                .bind(id)
                .fetch_one(&state.db)
                .await?;
        sync_role_entry_config(&state.db, &config_payload).await?;
    }
    audit(
        &state.db,
        user.person_id,
        "config_version",
        Some(id),
        "config.published",
        json!({}),
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "config.published",
        "config_version",
        Some(id),
        user.person_id,
        json!({ "namespace": namespace }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "published" })))
}

async fn sync_role_entry_config(db: &PgPool, payload: &Value) -> Result<(), ApiError> {
    let role_id =
        value_uuid(payload, "role_id").ok_or_else(|| ApiError::bad_request("role_id is required"))?;
    let default_home = value_str(payload, "default_home", "/");
    if !default_home.starts_with('/') {
        return Err(ApiError::bad_request("default_home must start with /"));
    }
    let layout = json!({
        "navigation": payload.get("navigation").cloned().unwrap_or_else(|| json!([]))
    });
    let quick_actions = payload
        .get("quick_actions")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let todo_types = payload
        .get("todo_types")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let result = sqlx::query(
        "UPDATE role_entry_configs
         SET default_home = $2, layout = $3, quick_actions = $4, todo_types = $5, updated_at = now()
         WHERE role_id = $1",
    )
    .bind(role_id)
    .bind(&default_home)
    .bind(layout.clone())
    .bind(quick_actions.clone())
    .bind(&todo_types)
    .execute(db)
    .await?;
    if result.rows_affected() == 0 {
        sqlx::query(
            "INSERT INTO role_entry_configs(role_id, default_home, layout, quick_actions, todo_types)
             VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(role_id)
        .bind(default_home)
        .bind(layout)
        .bind(quick_actions)
        .bind(todo_types)
        .execute(db)
        .await?;
    }
    Ok(())
}

async fn disable_config(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("config.publish")?;
    let id = value_uuid(&payload, "id").ok_or_else(|| ApiError::bad_request("id is required"))?;
    sqlx::query("UPDATE config_versions SET status = 'disabled' WHERE id = $1 AND namespace = $2")
        .bind(id)
        .bind(namespace)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "status": "disabled" })))
}

async fn config_versions(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(config_versions.*) AS item FROM config_versions ORDER BY namespace, version_no DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn runtime_status(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    readyz(State(state)).await
}
