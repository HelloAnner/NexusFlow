async fn list_skills(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(skill_tags.*) AS item FROM skill_tags ORDER BY name")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_skill(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO skill_tags(name, enabled, payload) VALUES ($1, true, $2) RETURNING id",
    )
    .bind(value_str(&payload, "name", ""))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    emit_event(
        &state.db,
        "person.skill_changed",
        "skill_tag",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_skill(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    sqlx::query(
        "UPDATE skill_tags SET name = COALESCE($2, name), payload = payload || $3 WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "person.skill_changed",
        "skill_tag",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn disable_skill(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    sqlx::query("UPDATE skill_tags SET enabled = false WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "enabled": false })))
}

async fn list_roles(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(roles.*) AS item FROM roles ORDER BY priority, code")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_role(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO roles(code, name, role_type, priority, enabled, payload) VALUES ($1,$2,$3,$4,true,$5) RETURNING id",
    )
    .bind(value_str(&payload, "code", ""))
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "role_type", "employee"))
    .bind(value_i64(&payload, "priority", 100) as i32)
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "role",
        Some(id),
        "role.created",
        json!({}),
        payload.clone(),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_role(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let before = get_json_by_id(&state.db, "roles", id).await?;
    sqlx::query(
        "UPDATE roles SET name = COALESCE($2, name), role_type = COALESCE($3, role_type), priority = COALESCE($4, priority), enabled = COALESCE($5, enabled), payload = payload || $6 WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("role_type").and_then(Value::as_str))
    .bind(payload.get("priority").and_then(Value::as_i64).map(|v| v as i32))
    .bind(payload.get("enabled").and_then(Value::as_bool))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "role",
        Some(id),
        "role.updated",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn role_actions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows =
        sqlx::query("SELECT action_code FROM role_actions WHERE role_id = $1 ORDER BY action_code")
            .bind(id)
            .fetch_all(&state.db)
            .await?;
    Ok(Json(
        json!({ "role_id": id, "actions": rows.iter().map(|r| r.get::<String, _>("action_code")).collect::<Vec<_>>() }),
    ))
}

async fn set_role_actions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let actions: Vec<String> = payload
        .get("actions")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let mut tx = state.db.begin().await?;
    sqlx::query("DELETE FROM role_actions WHERE role_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for action in &actions {
        sqlx::query("INSERT INTO role_actions(role_id, action_code) VALUES ($1, $2)")
            .bind(id)
            .bind(action)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    audit(
        &state.db,
        user.person_id,
        "role",
        Some(id),
        "role.actions_updated",
        json!({}),
        json!({ "actions": actions }),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "role_id": id, "actions": actions })))
}

async fn list_data_scope_rules(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let rows = sqlx::query(
        "SELECT (
           to_jsonb(dsr.*)
           || jsonb_build_object('role_code', r.code, 'role_name', r.name)
         ) AS item,
         count(*) OVER() AS total
         FROM data_scope_rules dsr
         JOIN roles r ON r.id = dsr.role_id
         WHERE ($1::uuid IS NULL OR dsr.role_id = $1)
         ORDER BY r.priority, r.code
         LIMIT $2 OFFSET $3",
    )
    .bind(query.role_id)
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
    Ok(Json(json!({
        "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "total": total
    })))
}

async fn create_data_scope_rule(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let role_id =
        value_uuid(&payload, "role_id").ok_or_else(|| ApiError::bad_request("role_id is required"))?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO data_scope_rules(role_id, scope_type, org_ids, project_scope_type, project_ids, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    )
    .bind(role_id)
    .bind(value_str(&payload, "scope_type", "self"))
    .bind(value_uuid_vec(&payload, "org_ids"))
    .bind(value_str(&payload, "project_scope_type", "member"))
    .bind(value_uuid_vec(&payload, "project_ids"))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "data_scope_rule",
        Some(id),
        "data_scope_rule.created",
        json!({}),
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_data_scope_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let before = get_json_by_id(&state.db, "data_scope_rules", id).await?;
    sqlx::query(
        "UPDATE data_scope_rules SET
          scope_type = COALESCE($2, scope_type),
          org_ids = COALESCE($3, org_ids),
          project_scope_type = COALESCE($4, project_scope_type),
          project_ids = COALESCE($5, project_ids),
          payload = payload || $6
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("scope_type").and_then(Value::as_str))
    .bind(if payload.get("org_ids").is_some() {
        Some(value_uuid_vec(&payload, "org_ids"))
    } else {
        None
    })
    .bind(payload.get("project_scope_type").and_then(Value::as_str))
    .bind(if payload.get("project_ids").is_some() {
        Some(value_uuid_vec(&payload, "project_ids"))
    } else {
        None
    })
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "data_scope_rule",
        Some(id),
        "data_scope_rule.updated",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn delete_data_scope_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let before = get_json_by_id(&state.db, "data_scope_rules", id)
        .await
        .unwrap_or_else(|_| json!({}));
    sqlx::query("DELETE FROM data_scope_rules WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    audit(
        &state.db,
        user.person_id,
        "data_scope_rule",
        Some(id),
        "data_scope_rule.deleted",
        before,
        json!({}),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id, "deleted": true })))
}

async fn list_visibility_grants(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(visibility_grants.*) AS item FROM visibility_grants ORDER BY created_at DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_visibility_grant(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO visibility_grants(object_type, object_id, subject_type, subject_id, grant_actions, expires_at, created_by, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(value_str(&payload, "object_type", "project"))
    .bind(value_uuid(&payload, "object_id").ok_or_else(|| ApiError::bad_request("object_id is required"))?)
    .bind(value_str(&payload, "subject_type", "person"))
    .bind(value_uuid(&payload, "subject_id").ok_or_else(|| ApiError::bad_request("subject_id is required"))?)
    .bind(payload.get("grant_actions").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect::<Vec<_>>()).unwrap_or_default())
    .bind(parse_datetime(&payload, "expires_at"))
    .bind(user.person_id)
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "visibility_grant",
        Some(id),
        "visibility_grant.created",
        json!({}),
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "project.visibility_changed",
        "visibility_grant",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn delete_visibility_grant(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let before = get_json_by_id(&state.db, "visibility_grants", id)
        .await
        .unwrap_or_else(|_| json!({}));
    sqlx::query("DELETE FROM visibility_grants WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    audit(
        &state.db,
        user.person_id,
        "visibility_grant",
        Some(id),
        "visibility_grant.deleted",
        before,
        json!({}),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id, "deleted": true })))
}

async fn list_audit(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let rows = sqlx::query(
        "SELECT to_jsonb(audit_logs.*) AS item FROM audit_logs
         WHERE ($1::text IS NULL OR action ILIKE '%' || $1 || '%' OR object_type ILIKE '%' || $1 || '%')
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(query.q.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}
