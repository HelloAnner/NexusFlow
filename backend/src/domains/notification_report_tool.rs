async fn list_todos(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(todo_items.*) AS item FROM todo_items
         WHERE ($1::uuid IS NULL OR assignee_id = $1)
           AND ($2::text IS NULL OR status = $2)
         ORDER BY created_at DESC LIMIT $3 OFFSET $4",
    )
    .bind(if user.is_sa() { None } else { user.person_id })
    .bind(query.status.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn complete_todo(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    payload: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let payload = payload.map(|Json(value)| value).unwrap_or_else(|| json!({}));
    let reason = value_str(&payload, "completion_reason", "");
    let before = sqlx::query("SELECT to_jsonb(todo_items.*) AS item FROM todo_items WHERE id = $1 AND ($2::bool OR assignee_id = $3)")
        .bind(id)
        .bind(user.is_sa())
        .bind(user.person_id)
        .fetch_optional(&state.db)
        .await?
        .map(|r| json_row(&r, "item"))
        .transpose()?
        .ok_or_else(|| ApiError::not_found("todo not found"))?;
    let completed_by = user.person_id.map(|id| id.to_string());
    let after = sqlx::query(
        "UPDATE todo_items
         SET status = 'completed',
             payload = payload || jsonb_build_object(
               'completion_reason', $2::text,
               'completed_at', now(),
               'completed_by', $3::text
             )
         WHERE id = $1
         RETURNING to_jsonb(todo_items.*) AS item",
    )
    .bind(id)
    .bind(reason.clone())
    .bind(completed_by)
    .fetch_one(&state.db)
    .await?;
    let after = json_row(&after, "item")?;
    audit(
        &state.db,
        user.person_id,
        "todo_item",
        Some(id),
        "todo.complete",
        before,
        after.clone(),
        reason.as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "todo.completed",
        "todo_item",
        Some(id),
        user.person_id,
        json!({ "completion_reason": reason }),
    )
    .await?;
    Ok(Json(after))
}

async fn list_notifications(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(notifications.*) AS item FROM notifications
         WHERE ($1::uuid IS NULL OR receiver_id = $1)
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(if user.is_sa() { None } else { user.person_id })
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    let mut items = Vec::new();
    for row in rows {
        let item = json_row(&row, "item")?;
        items.push(notification_for_user(&state.db, &user, item).await?);
    }
    Ok(Json(
        json!({ "items": items }),
    ))
}

async fn read_notification(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    sqlx::query(
        "UPDATE notifications SET read_at = now() WHERE id = $1 AND ($2::bool OR receiver_id = $3)",
    )
    .bind(id)
    .bind(user.is_sa())
    .bind(user.person_id)
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "id": id, "read": true })))
}

async fn list_reports(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT report_type, count(*) AS count, max(generated_at) AS latest
         FROM report_snapshots
         WHERE ($1::bool OR scope_id = $2)
         GROUP BY report_type ORDER BY report_type",
    )
        .bind(user.is_sa())
        .bind(user.person_id)
        .fetch_all(&state.db)
        .await?;
    let items: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "report_type": r.get::<String, _>("report_type"),
                "count": r.get::<i64, _>("count"),
                "latest": r.try_get::<DateTime<Utc>, _>("latest").ok()
            })
        })
        .collect();
    Ok(Json(json!({ "items": items })))
}

async fn get_report(
    State(state): State<Arc<AppState>>,
    Path(report_type): Path<String>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let item = sqlx::query(
        "SELECT to_jsonb(report_snapshots.*) AS item
         FROM report_snapshots
         WHERE report_type = $1 AND ($2::bool OR scope_id = $3)
         ORDER BY generated_at DESC LIMIT 1",
    )
        .bind(&report_type)
        .bind(user.is_sa())
        .bind(user.person_id)
        .fetch_optional(&state.db)
        .await?
        .map(|r| json_row(&r, "item"))
        .transpose()?;
    Ok(Json(
        json!({ "report_type": report_type, "snapshot": item }),
    ))
}

async fn export_report(
    State(state): State<Arc<AppState>>,
    Path(report_type): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("report.export")?;
    let period_start = parse_date(&payload, "period_start");
    let period_end = parse_date(&payload, "period_end");
    let report_payload =
        build_report_payload(&state.db, &user, &report_type, period_start, period_end).await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO report_snapshots(report_type, scope_type, scope_id, period_start, period_end, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    )
    .bind(&report_type)
    .bind("user")
    .bind(user.person_id)
    .bind(period_start)
    .bind(period_end)
    .bind(report_payload.clone())
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "report_snapshot",
        Some(id),
        "report.export",
        json!({ "requested": payload }),
        report_payload.clone(),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "generated", "payload": report_payload })))
}

async fn notification_for_user(
    db: &PgPool,
    user: &CurrentUser,
    mut item: Value,
) -> Result<Value, ApiError> {
    let payload = item.get("payload").cloned().unwrap_or_else(|| json!({}));
    let action_url = payload
        .get("action_url")
        .and_then(Value::as_str)
        .or_else(|| payload.get("url").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let notification_type = payload
        .get("notification_type")
        .and_then(Value::as_str)
        .or_else(|| payload.get("type").and_then(Value::as_str))
        .unwrap_or("system")
        .to_string();

    item["notification_type"] = json!(notification_type);
    item["action_url"] = if action_url.is_empty() {
        Value::Null
    } else {
        json!(action_url)
    };

    if notification_target_visible(db, user, item["action_url"].as_str()).await? {
        return Ok(item);
    }

    item["title"] = json!("权限受限通知");
    item["content"] = json!("通知关联的数据不在当前账号的数据范围内，已隐藏正文和跳转。");
    item["action_url"] = Value::Null;
    item["payload"] = json!({
        "redacted": true,
        "reason": "out_of_data_scope",
        "notification_type": item["notification_type"]
    });
    Ok(item)
}

async fn notification_target_visible(
    db: &PgPool,
    user: &CurrentUser,
    action_url: Option<&str>,
) -> Result<bool, ApiError> {
    let Some(action_url) = action_url else {
        return Ok(true);
    };
    let target = [
        ("/tasks/", "task"),
        ("/projects/", "project"),
        ("/resources/", "resource"),
        ("/people/", "person"),
    ]
    .iter()
    .find_map(|(prefix, object_type)| {
        action_url
            .strip_prefix(prefix)
            .and_then(|rest| rest.split('/').next())
            .and_then(|id| Uuid::parse_str(id).ok())
            .map(|id| (*object_type, id))
    });

    let Some((object_type, id)) = target else {
        return Ok(true);
    };
    let result = match object_type {
        "task" => ensure_task_visible(db, user, id).await,
        "project" => ensure_project_visible(db, user, id).await,
        "resource" => ensure_resource_visible(db, user, id).await,
        "person" => ensure_person_visible(db, user, id).await,
        _ => Ok(()),
    };
    match result {
        Ok(()) => Ok(true),
        Err(ApiError::Forbidden { .. }) | Err(ApiError::NotFound { .. }) => Ok(false),
        Err(err) => Err(err),
    }
}

async fn list_tools(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(t.*) AS item FROM tool_entries t
         WHERE t.enabled AND (
           $1::bool OR NOT EXISTS (SELECT 1 FROM tool_permissions tp WHERE tp.tool_id = t.id)
           OR EXISTS (
             SELECT 1 FROM tool_permissions tp WHERE tp.tool_id = t.id
             AND ((tp.subject_type = 'person' AND tp.subject_id = $2) OR (tp.subject_type = 'role' AND tp.subject_id = ANY($3)))
           )
         )
         ORDER BY category, name",
    )
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(&user.role_ids)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_tool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    Ok(Json(get_json_by_id(&state.db, "tool_entries", id).await?))
}

async fn create_tool(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("tool.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO tool_entries(name, category, entry_type, entry_url, enabled, icon, description, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "category", "common"))
    .bind(value_str(&payload, "entry_type", "external"))
    .bind(value_str(&payload, "entry_url", ""))
    .bind(value_bool(&payload, "enabled", true))
    .bind(value_str(&payload, "icon", ""))
    .bind(value_str(&payload, "description", ""))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_tool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("tool.manage")?;
    sqlx::query(
        "UPDATE tool_entries SET name = COALESCE($2, name), category = COALESCE($3, category), entry_type = COALESCE($4, entry_type),
         entry_url = COALESCE($5, entry_url), enabled = COALESCE($6, enabled), icon = COALESCE($7, icon), description = COALESCE($8, description),
         payload = payload || $9, updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("category").and_then(Value::as_str))
    .bind(payload.get("entry_type").and_then(Value::as_str))
    .bind(payload.get("entry_url").and_then(Value::as_str))
    .bind(payload.get("enabled").and_then(Value::as_bool))
    .bind(payload.get("icon").and_then(Value::as_str))
    .bind(payload.get("description").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn tool_context(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let source_type = value_str(&payload, "source_type", "manual");
    let source_id = value_uuid(&payload, "source_id");
    if source_type == "project" {
        if let Some(source_id) = source_id {
            ensure_project_visible(&state.db, &user, source_id).await?;
        }
    }
    if source_type == "task" {
        if let Some(source_id) = source_id {
            ensure_task_visible(&state.db, &user, source_id).await?;
        }
    }
    Ok(Json(json!({
        "tool_id": id,
        "source_type": source_type,
        "source_id": source_id,
        "user": { "person_id": user.person_id, "roles": user.role_codes },
        "sensitive_context_included": false
    })))
}

async fn record_tool_usage(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let usage_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO tool_usage_logs(tool_id, user_id, source_type, source_id, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(id)
    .bind(user.person_id)
    .bind(value_str(&payload, "source_type", "manual"))
    .bind(value_uuid(&payload, "source_id"))
    .bind(payload)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": usage_id })))
}

async fn tool_usage(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(tool_usage_logs.*) AS item FROM tool_usage_logs WHERE tool_id = $1 AND ($2::bool OR user_id = $3) ORDER BY used_at DESC LIMIT 100",
    )
    .bind(id)
    .bind(user.is_sa())
    .bind(user.person_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}
