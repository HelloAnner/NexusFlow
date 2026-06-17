async fn submit_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let preview = compute_dispatch_preview(&state.db, id).await?;
    let has_blocking = preview
        .get("requires_approval")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let to = if has_blocking {
        "coordination_pending"
    } else {
        "confirmation_pending"
    };
    let result = transition_task(
        &state.db,
        &user,
        id,
        &["draft"],
        to,
        "task.submitted",
        payload,
    )
    .await?;
    if has_blocking {
        create_approval_ticket_internal(&state.db, id, "cross_department", user.person_id, preview)
            .await?;
    }
    Ok(result)
}

async fn confirm_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let _ = transition_task(
        &state.db,
        &user,
        id,
        &["coordination_pending", "confirmation_pending"],
        "in_progress",
        "task.started",
        payload,
    )
    .await?;
    recalculate_task_workload(&state.db, id).await?;
    Ok(Json(json!({ "id": id, "status": "in_progress" })))
}

async fn start_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let _ = transition_task(
        &state.db,
        &user,
        id,
        &["confirmation_pending"],
        "in_progress",
        "task.started",
        payload,
    )
    .await?;
    recalculate_task_workload(&state.db, id).await?;
    Ok(Json(json!({ "id": id, "status": "in_progress" })))
}

async fn pause_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    transition_task(
        &state.db,
        &user,
        id,
        &["in_progress", "risk"],
        "paused",
        "task.paused",
        payload,
    )
    .await
}

async fn cancel_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    transition_task(
        &state.db,
        &user,
        id,
        &[
            "draft",
            "coordination_pending",
            "confirmation_pending",
            "in_progress",
            "paused",
            "risk",
        ],
        "cancelled",
        "task.cancelled",
        payload,
    )
    .await
}

async fn submit_acceptance(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_required_resources(&state.db, id).await?;
    sqlx::query("INSERT INTO task_acceptances(task_id, submitter_id, acceptor_id, status, comment, payload) SELECT id, $2, acceptor_id, 'pending', $3, $4 FROM tasks WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    transition_task(
        &state.db,
        &user,
        id,
        &["in_progress", "risk", "acceptance_rejected"],
        "acceptance_pending",
        "task.acceptance_requested",
        payload,
    )
    .await
}

async fn accept_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if !user.is_sa() {
        user.require_action("task.accept")?;
    }
    sqlx::query("UPDATE task_acceptances SET status = 'accepted', acceptor_id = $2, comment = $3, acted_at = now() WHERE task_id = $1 AND status = 'pending'")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    transition_task(
        &state.db,
        &user,
        id,
        &["acceptance_pending"],
        "completed",
        "task.accepted",
        payload,
    )
    .await
}

async fn reject_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if !user.is_sa() {
        user.require_action("task.accept")?;
    }
    sqlx::query("UPDATE task_acceptances SET status = 'rejected', acceptor_id = $2, comment = $3, acted_at = now() WHERE task_id = $1 AND status = 'pending'")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    transition_task(
        &state.db,
        &user,
        id,
        &["acceptance_pending"],
        "acceptance_rejected",
        "task.rejected",
        payload,
    )
    .await
}

async fn archive_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let result = transition_task(
        &state.db,
        &user,
        id,
        &["completed"],
        "archived",
        "task.archived",
        payload,
    )
    .await?;
    sqlx::query("UPDATE resource_files SET status = 'archived' WHERE id IN (SELECT resource_id FROM resource_links WHERE object_type = 'task' AND object_id = $1)")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(result)
}

async fn create_assignment(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_task_editable(&state.db, &user, task_id).await?;
    let owner_id = value_uuid(&payload, "owner_id")
        .ok_or_else(|| ApiError::bad_request("owner_id is required"))?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO task_assignments(task_id, title, owner_id, collaborator_ids, start_date, due_date, estimated_total_hours, daily_commitment_type, daily_commitment_hours, acceptor_id, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
    )
    .bind(task_id)
    .bind(value_str(&payload, "title", ""))
    .bind(owner_id)
    .bind(value_uuid_vec(&payload, "collaborator_ids"))
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "due_date"))
    .bind(value_f64(&payload, "estimated_total_hours", 0.0))
    .bind(value_str(&payload, "daily_commitment_type", "hours"))
    .bind(value_f64(&payload, "daily_commitment_hours", 0.0))
    .bind(value_uuid(&payload, "acceptor_id"))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    emit_event(
        &state.db,
        "task.changed",
        "assignment",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_assignment(
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
        "UPDATE task_assignments SET
          title = COALESCE($2, title), owner_id = COALESCE($3, owner_id),
          collaborator_ids = COALESCE($4, collaborator_ids), start_date = COALESCE($5, start_date), due_date = COALESCE($6, due_date),
          estimated_total_hours = COALESCE($7, estimated_total_hours), daily_commitment_type = COALESCE($8, daily_commitment_type),
          daily_commitment_hours = COALESCE($9, daily_commitment_hours), progress = COALESCE($10, progress), status = COALESCE($11, status),
          payload = payload || $12, updated_at = now(), version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("title").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_id"))
    .bind(if payload.get("collaborator_ids").is_some() { Some(value_uuid_vec(&payload, "collaborator_ids")) } else { None })
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "due_date"))
    .bind(payload.get("estimated_total_hours").and_then(Value::as_f64))
    .bind(payload.get("daily_commitment_type").and_then(Value::as_str))
    .bind(payload.get("daily_commitment_hours").and_then(Value::as_f64))
    .bind(payload.get("progress").and_then(Value::as_f64))
    .bind(payload.get("status").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "task.changed",
        "assignment",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn assignment_progress(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let row = sqlx::query(
        "SELECT task_id, owner_id, collaborator_ids FROM task_assignments WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    let owner_id: Uuid = row.get("owner_id");
    let collaborators: Vec<Uuid> = row.get("collaborator_ids");
    if !user.is_sa()
        && Some(owner_id) != user.person_id
        && !user
            .person_id
            .is_some_and(|pid| collaborators.contains(&pid))
    {
        return Err(ApiError::forbidden(
            "only assignment owner or collaborator can report progress",
        ));
    }
    sqlx::query(
        "INSERT INTO task_progress_reports(assignment_id, reporter_id, spent_hours, progress, content, result_resource_ids, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(id)
    .bind(user.person_id.ok_or_else(|| ApiError::forbidden("person binding is required"))?)
    .bind(value_f64(&payload, "spent_hours", 0.0))
    .bind(value_f64(&payload, "progress", 0.0))
    .bind(value_str(&payload, "content", ""))
    .bind(value_uuid_vec(&payload, "result_resource_ids"))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE task_assignments SET progress = GREATEST(progress, $2), confirmed_spent_hours = confirmed_spent_hours + $3, status = CASE WHEN $2 >= 100 THEN 'pending_confirmation' ELSE 'in_progress' END, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(value_f64(&payload, "progress", 0.0))
        .bind(value_f64(&payload, "spent_hours", 0.0))
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "assignment.progress_reported",
        "assignment",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn assignment_submit_result(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    assignment_progress(State(state), Path(id), user, Json(json!({
        "spent_hours": value_f64(&payload, "spent_hours", 0.0),
        "progress": 100.0,
        "content": value_str(&payload, "content", ""),
        "result_resource_ids": payload.get("result_resource_ids").cloned().unwrap_or_else(|| json!([]))
    }))).await
}
