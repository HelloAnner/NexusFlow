async fn assignment_confirm(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let task_id: Uuid = sqlx::query_scalar("SELECT task_id FROM task_assignments WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    ensure_task_editable(&state.db, &user, task_id).await?;
    sqlx::query(
        "UPDATE task_assignments
         SET status = 'completed', progress = 100, updated_at = now(), version = version + 1,
             payload = payload || $2
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "assignment.confirmed",
        "assignment",
        Some(id),
        user.person_id,
        payload.clone(),
    )
    .await?;
    log_assignment_change(
        &state.db,
        task_id,
        user.person_id,
        "assignment.confirmed",
        value_str(&payload, "reason", ""),
        json!({ "assignment_id": id, "payload": payload }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "completed" })))
}

async fn assignment_return(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let task_id: Uuid = sqlx::query_scalar("SELECT task_id FROM task_assignments WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    ensure_task_editable(&state.db, &user, task_id).await?;
    let reason = value_str(&payload, "reason", "");
    if reason.is_empty() {
        return Err(ApiError::bad_request("reason is required"));
    }
    sqlx::query(
        "UPDATE task_assignments
         SET status = 'in_progress', updated_at = now(), version = version + 1,
             payload = payload || $2
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "assignment.returned",
        "assignment",
        Some(id),
        user.person_id,
        payload.clone(),
    )
    .await?;
    log_assignment_change(
        &state.db,
        task_id,
        user.person_id,
        "assignment.returned",
        reason,
        json!({ "assignment_id": id, "payload": payload }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "in_progress" })))
}

async fn log_assignment_change(
    db: &PgPool,
    task_id: Uuid,
    actor_id: Option<Uuid>,
    change_type: &str,
    reason: String,
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
