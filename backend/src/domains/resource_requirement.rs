async fn set_task_resource_requirements(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_task_editable(&state.db, &user, task_id).await?;
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| ApiError::bad_request("items is required"))?;
    let before = evaluate_resource_requirements(&state.db, "task", task_id).await?;
    sqlx::query("DELETE FROM resource_requirements WHERE object_type = 'task' AND object_id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;
    for item in items {
        let resource_type = value_str(item, "resource_type", "");
        if resource_type.is_empty() {
            return Err(ApiError::bad_request("resource_type is required"));
        }
        sqlx::query(
            "INSERT INTO resource_requirements(object_type, object_id, resource_type, required, payload)
             VALUES ('task', $1, $2, $3, $4)",
        )
        .bind(task_id)
        .bind(resource_type)
        .bind(item.get("required").and_then(Value::as_bool).unwrap_or(true))
        .bind(item.clone())
        .execute(&state.db)
        .await?;
    }
    let after = evaluate_resource_requirements(&state.db, "task", task_id).await?;
    let reason = value_str(&payload, "reason", "更新验收资料规则");
    log_task_change(
        &state.db,
        task_id,
        user.person_id,
        "resource_requirements.updated",
        &reason,
        json!({ "before": before, "after": after }),
    )
    .await?;
    emit_event(
        &state.db,
        "resource_requirements.updated",
        "task",
        Some(task_id),
        user.person_id,
        json!({ "items": items, "reason": reason }),
    )
    .await?;
    Ok(Json(after))
}

async fn evaluate_resource_requirements(
    db: &PgPool,
    object_type: &str,
    object_id: Uuid,
) -> Result<Value, ApiError> {
    let rows = sqlx::query(
        "SELECT
           rr.id,
           rr.resource_type,
           rr.required,
           rr.payload,
           COALESCE((rr.payload->>'label'), rr.resource_type) AS label,
           GREATEST(COALESCE((rr.payload->>'min_count')::int, 1), 1) AS min_count,
           COALESCE((rr.payload->>'require_confirmed')::bool, false) AS require_confirmed,
           COALESCE((rr.payload->>'require_stage_result')::bool, false) AS require_stage_result,
           COALESCE((rr.payload->>'require_final_result')::bool, false) AS require_final_result,
           COALESCE(matches.matched_count, 0) AS matched_count,
           COALESCE(matches.confirmed_count, 0) AS confirmed_count,
           COALESCE(matches.stage_count, 0) AS stage_count,
           COALESCE(matches.final_count, 0) AS final_count
         FROM resource_requirements rr
         LEFT JOIN LATERAL (
           SELECT
             count(*)::int AS matched_count,
             count(*) FILTER (WHERE rf.status IN ('confirmed', 'archived'))::int AS confirmed_count,
             count(*) FILTER (WHERE rf.is_stage_result)::int AS stage_count,
             count(*) FILTER (WHERE rf.is_final_result)::int AS final_count
           FROM resource_links rl
           JOIN resource_files rf ON rf.id = rl.resource_id AND rf.deleted_at IS NULL
           WHERE rl.object_type = rr.object_type
             AND rl.object_id = rr.object_id
             AND rf.resource_type = rr.resource_type
             AND rf.status IN ('submitted', 'confirmed', 'archived')
         ) matches ON true
         WHERE rr.object_type = $1 AND rr.object_id = $2
         ORDER BY rr.resource_type",
    )
    .bind(object_type)
    .bind(object_id)
    .fetch_all(db)
    .await?;
    let mut items = Vec::new();
    let mut required_count = 0;
    let mut satisfied_count = 0;
    for row in rows {
        let required: bool = row.get("required");
        let min_count: i32 = row.get("min_count");
        let matched_count: i32 = row.get("matched_count");
        let confirmed_count: i32 = row.get("confirmed_count");
        let stage_count: i32 = row.get("stage_count");
        let final_count: i32 = row.get("final_count");
        let require_confirmed: bool = row.get("require_confirmed");
        let require_stage_result: bool = row.get("require_stage_result");
        let require_final_result: bool = row.get("require_final_result");
        let mut missing = Vec::new();
        if matched_count < min_count {
            missing.push(format!("缺少 {} 份资料", min_count - matched_count));
        }
        if require_confirmed && confirmed_count < min_count {
            missing.push("资料未确认".to_string());
        }
        if require_stage_result && stage_count < min_count {
            missing.push("未标记阶段成果".to_string());
        }
        if require_final_result && final_count < min_count {
            missing.push("未标记最终成果".to_string());
        }
        let satisfied = !required || missing.is_empty();
        if required {
            required_count += 1;
            if satisfied {
                satisfied_count += 1;
            }
        }
        items.push(json!({
            "id": row.get::<Uuid, _>("id"),
            "resource_type": row.get::<String, _>("resource_type"),
            "label": row.get::<String, _>("label"),
            "required": required,
            "min_count": min_count,
            "require_confirmed": require_confirmed,
            "require_stage_result": require_stage_result,
            "require_final_result": require_final_result,
            "matched_count": matched_count,
            "confirmed_count": confirmed_count,
            "stage_count": stage_count,
            "final_count": final_count,
            "satisfied": satisfied,
            "missing_reasons": missing,
            "payload": row.get::<Value, _>("payload")
        }));
    }
    let missing_count = required_count - satisfied_count;
    let completion_rate = if required_count == 0 {
        1.0
    } else {
        satisfied_count as f64 / required_count as f64
    };
    Ok(json!({
        "items": items,
        "summary": {
            "required_count": required_count,
            "satisfied_count": satisfied_count,
            "missing_count": missing_count,
            "completion_rate": completion_rate,
            "can_submit_acceptance": missing_count == 0
        }
    }))
}

async fn log_task_change(
    db: &PgPool,
    task_id: Uuid,
    actor_id: Option<Uuid>,
    change_type: &str,
    reason: &str,
    after_payload: Value,
) -> Result<(), ApiError> {
    sqlx::query("INSERT INTO task_change_logs(task_id, changed_by, change_type, reason, after_payload) VALUES ($1,$2,$3,$4,$5)")
        .bind(task_id)
        .bind(actor_id)
        .bind(change_type)
        .bind(reason)
        .bind(after_payload)
        .execute(db)
        .await?;
    Ok(())
}
