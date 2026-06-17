async fn compute_dispatch_preview(db: &PgPool, task_id: Uuid) -> Result<Value, ApiError> {
    let task = sqlx::query("SELECT owner_org_id, project_id FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_one(db)
        .await?;
    let owner_org_id: Option<Uuid> = task.try_get("owner_org_id").ok();
    let members = sqlx::query(
        "SELECT tm.person_id, p.primary_org_id, p.dispatch_enabled, p.work_status,
          tm.daily_commitment_type, tm.daily_commitment_hours::float8 AS daily_hours, tm.start_date, tm.due_date
         FROM task_members tm
         JOIN persons p ON p.id = tm.person_id
         WHERE tm.task_id = $1",
    )
    .bind(task_id)
    .fetch_all(db)
    .await?;
    let mut conflicts = Vec::new();
    let mut requires_approval = false;
    for row in members {
        let person_id: Uuid = row.get("person_id");
        let primary_org_id: Option<Uuid> = row.try_get("primary_org_id").ok();
        let dispatch_enabled: bool = row.get("dispatch_enabled");
        let work_status: String = row.get("work_status");
        if owner_org_id.is_some() && primary_org_id.is_some() && owner_org_id != primary_org_id {
            requires_approval = true;
            conflicts.push(json!({ "type": "cross_department", "person_id": person_id, "target_org_id": primary_org_id }));
        }
        if !dispatch_enabled || work_status != "active" {
            requires_approval = true;
            conflicts.push(json!({ "type": "person_unavailable", "person_id": person_id, "work_status": work_status }));
        }
        let start: Option<NaiveDate> = row.try_get("start_date").ok();
        let end: Option<NaiveDate> = row.try_get("due_date").ok();
        let daily_type: String = row.get("daily_commitment_type");
        let daily_hours: f64 = row.get("daily_hours");
        if let (Some(start), Some(end)) = (start, end) {
            let preview = preview_person_load(
                db,
                person_id,
                start,
                end,
                daily_hours,
                daily_type == "full_day",
            )
            .await?;
            if preview
                .get("conflicts")
                .and_then(Value::as_array)
                .is_some_and(|v| !v.is_empty())
            {
                requires_approval = true;
                conflicts.push(json!({ "type": "workload_conflict", "person_id": person_id, "preview": preview }));
            }
        }
    }
    Ok(
        json!({ "task_id": task_id, "requires_approval": requires_approval, "conflicts": conflicts }),
    )
}

async fn dispatch_preview(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    let task_id = value_uuid(&payload, "task_id")
        .ok_or_else(|| ApiError::bad_request("task_id is required"))?;
    ensure_task_visible(&state.db, &user, task_id).await?;
    Ok(Json(compute_dispatch_preview(&state.db, task_id).await?))
}

async fn dispatch_submit(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    let task_id = value_uuid(&payload, "task_id")
        .ok_or_else(|| ApiError::bad_request("task_id is required"))?;
    let preview = compute_dispatch_preview(&state.db, task_id).await?;
    let dispatch_type = if preview
        .get("requires_approval")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "cross_department"
    } else {
        "direct"
    };
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO dispatch_requests(task_id, requester_id, dispatch_type, status, reason, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    )
    .bind(task_id)
    .bind(user.person_id.ok_or_else(|| ApiError::forbidden("person binding is required"))?)
    .bind(dispatch_type)
    .bind(if dispatch_type == "direct" { "effective" } else { "pending" })
    .bind(value_str(&payload, "reason", ""))
    .bind(json!({ "request": payload, "preview": preview }))
    .fetch_one(&state.db)
    .await?;
    if dispatch_type == "direct" {
        sqlx::query("UPDATE tasks SET status = 'confirmation_pending', updated_at = now() WHERE id = $1 AND status = 'draft'")
            .bind(task_id)
            .execute(&state.db)
            .await?;
        emit_event(
            &state.db,
            "dispatch.effective",
            "dispatch_request",
            Some(id),
            user.person_id,
            json!({ "task_id": task_id }),
        )
        .await?;
    } else {
        create_approval_ticket_internal(
            &state.db,
            task_id,
            "cross_department",
            user.person_id,
            preview,
        )
        .await?;
        sqlx::query(
            "UPDATE tasks SET status = 'coordination_pending', updated_at = now() WHERE id = $1",
        )
        .bind(task_id)
        .execute(&state.db)
        .await?;
    }
    Ok(Json(json!({ "id": id, "dispatch_type": dispatch_type })))
}

async fn create_approval_ticket_internal(
    db: &PgPool,
    task_id: Uuid,
    ticket_type: &str,
    actor_id: Option<Uuid>,
    payload: Value,
) -> Result<Uuid, ApiError> {
    let target_person_ids: Vec<Uuid> =
        sqlx::query_scalar("SELECT person_id FROM task_members WHERE task_id = $1")
            .bind(task_id)
            .fetch_all(db)
            .await?;
    let target_org_id: Option<Uuid> =
        sqlx::query_scalar("SELECT owner_org_id FROM tasks WHERE id = $1")
            .bind(task_id)
            .fetch_optional(db)
            .await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO approval_tickets(task_id, ticket_type, target_person_ids, target_org_id, status, created_by, payload)
         VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING id",
    )
    .bind(task_id)
    .bind(ticket_type)
    .bind(target_person_ids)
    .bind(target_org_id)
    .bind(actor_id)
    .bind(payload.clone())
    .fetch_one(db)
    .await?;
    sqlx::query("INSERT INTO approval_steps(ticket_id, step_order, approver_source, payload) VALUES ($1, 1, 'default_approver', $2)")
        .bind(id)
        .bind(payload)
        .execute(db)
        .await?;
    emit_event(
        db,
        "approval.requested",
        "approval_ticket",
        Some(id),
        actor_id,
        json!({ "task_id": task_id, "ticket_type": ticket_type }),
    )
    .await?;
    create_todo_for_ticket(db, id).await?;
    Ok(id)
}

async fn create_todo_for_ticket(db: &PgPool, ticket_id: Uuid) -> Result<(), sqlx::Error> {
    let row = sqlx::query("SELECT task_id, target_org_id FROM approval_tickets WHERE id = $1")
        .bind(ticket_id)
        .fetch_one(db)
        .await?;
    let target_org_id: Option<Uuid> = row.try_get("target_org_id").ok();
    let task_id: Option<Uuid> = row.try_get("task_id").ok();
    let approvers: Vec<Uuid> = if let Some(org_id) = target_org_id {
        sqlx::query_scalar("SELECT unnest(default_approver_ids) FROM organizations WHERE id = $1")
            .bind(org_id)
            .fetch_all(db)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    for approver in approvers {
        sqlx::query(
            "INSERT INTO todo_items(todo_type, title, target_type, target_id, assignee_id, action_url)
             VALUES ('approval', '待审批协调单', 'approval_ticket', $1, $2, $3)",
        )
        .bind(ticket_id)
        .bind(approver)
        .bind(format!("/approvals/{ticket_id}"))
        .execute(db)
        .await?;
    }
    if let Some(task_id) = task_id {
        emit_event(
            db,
            "notification.todo_created",
            "task",
            Some(task_id),
            None,
            json!({ "ticket_id": ticket_id }),
        )
        .await?;
    }
    Ok(())
}

async fn list_approvals(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(approval_tickets.*) AS item FROM approval_tickets
         WHERE ($1::text IS NULL OR status = $1)
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(query.status.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_approval(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let ticket = get_json_by_id(&state.db, "approval_tickets", id).await?;
    let steps = sqlx::query("SELECT to_jsonb(approval_steps.*) AS item FROM approval_steps WHERE ticket_id = $1 ORDER BY step_order")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "ticket": ticket, "steps": steps.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn approval_action(
    state: Arc<AppState>,
    user: CurrentUser,
    id: Uuid,
    action: &str,
    status: &str,
    payload: Value,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.approve")?;
    if matches!(action, "reject" | "adjust" | "escalate")
        && value_str(&payload, "comment", "").is_empty()
    {
        return Err(ApiError::bad_request(
            "comment is required for reject/adjust/escalate",
        ));
    }
    let ticket = get_json_by_id(&state.db, "approval_tickets", id).await?;
    if ticket.get("status").and_then(Value::as_str) != Some("pending") && action != "escalate" {
        return Err(ApiError::conflict("approval ticket is not pending"));
    }
    sqlx::query("UPDATE approval_tickets SET status = $2, updated_at = now(), payload = payload || $3 WHERE id = $1")
        .bind(id)
        .bind(status)
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE approval_steps SET approver_id = $2, action = $3, comment = $4, acted_at = now(), payload = payload || $5 WHERE ticket_id = $1 AND step_order = (SELECT current_step FROM approval_tickets WHERE id = $1)")
        .bind(id)
        .bind(user.person_id)
        .bind(action)
        .bind(value_str(&payload, "comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    let task_id = ticket
        .get("task_id")
        .and_then(Value::as_str)
        .and_then(|v| Uuid::parse_str(v).ok());
    if let Some(task_id) = task_id {
        match status {
            "approved" | "adjusted_approved" => {
                sqlx::query("UPDATE tasks SET status = 'confirmation_pending', updated_at = now() WHERE id = $1 AND status = 'coordination_pending'")
                    .bind(task_id)
                    .execute(&state.db)
                    .await?;
                emit_event(
                    &state.db,
                    "approval.completed",
                    "approval_ticket",
                    Some(id),
                    user.person_id,
                    json!({ "status": status }),
                )
                .await?;
            }
            "rejected" => {
                sqlx::query("UPDATE tasks SET status = 'draft', updated_at = now() WHERE id = $1 AND status = 'coordination_pending'")
                    .bind(task_id)
                    .execute(&state.db)
                    .await?;
                emit_event(
                    &state.db,
                    "approval.rejected",
                    "approval_ticket",
                    Some(id),
                    user.person_id,
                    json!({ "status": status }),
                )
                .await?;
            }
            _ => {}
        }
    }
    sqlx::query("UPDATE todo_items SET status = 'completed' WHERE target_type = 'approval_ticket' AND target_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "status": status })))
}

async fn approval_approve(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    approval_action(state, user, id, "approve", "approved", payload).await
}

async fn approval_reject(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    approval_action(state, user, id, "reject", "rejected", payload).await
}

async fn approval_adjust(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    approval_action(state, user, id, "adjust", "adjusted_approved", payload).await
}

async fn approval_escalate(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.approve")?;
    sqlx::query("UPDATE approval_tickets SET status = 'escalated', current_step = current_step + 1, updated_at = now(), payload = payload || $2 WHERE id = $1")
        .bind(id)
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO approval_steps(ticket_id, step_order, approver_source, comment, payload) SELECT id, current_step, 'escalated', $2, $3 FROM approval_tickets WHERE id = $1")
        .bind(id)
        .bind(value_str(&payload, "comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "approval.escalated",
        "approval_ticket",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "escalated" })))
}

async fn create_meeting_record(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let record_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO coordination_meeting_records(ticket_id, meeting_at, participants, topic, conclusion, next_actions, resource_ids, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(id)
    .bind(parse_datetime(&payload, "meeting_at").unwrap_or_else(Utc::now))
    .bind(value_uuid_vec(&payload, "participants"))
    .bind(value_str(&payload, "topic", ""))
    .bind(value_str(&payload, "conclusion", ""))
    .bind(value_str(&payload, "next_actions", ""))
    .bind(value_uuid_vec(&payload, "resource_ids"))
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": record_id })))
}
