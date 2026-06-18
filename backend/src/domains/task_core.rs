async fn list_tasks(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT (
          to_jsonb(t.*)
          || jsonb_build_object(
            'payload',
            t.payload || jsonb_build_object(
              'owner_name', owner.name,
              'project_name', p.name,
              'owner_org_name', org.name
            )
          )
        ) AS item,
          count(*) OVER() AS total
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN persons owner ON owner.id = t.owner_id
         LEFT JOIN organizations org ON org.id = t.owner_org_id
         WHERE t.deleted_at IS NULL
           AND (
             $1::text IS NULL
             OR concat_ws(' ', t.name, t.task_no, t.summary, t.deliverable_requirement, t.status, t.sub_type, owner.name, p.name, org.name) ILIKE '%' || $1 || '%'
           )
           AND ($2::text IS NULL OR t.status = $2)
           AND ($8::text IS NULL OR t.sub_type = $8)
           AND ($9::text IS NULL OR t.priority = $9)
           AND ($10::uuid IS NULL OR t.owner_org_id = $10)
           AND ($11::uuid IS NULL OR t.project_id = $11)
           AND ($12::uuid IS NULL OR t.owner_id = $12)
           AND ($13::uuid IS NULL OR EXISTS (
             SELECT 1 FROM task_members tm2 WHERE tm2.task_id = t.id AND tm2.person_id = $13
           ) OR EXISTS (
             SELECT 1 FROM task_assignments ta2 WHERE ta2.task_id = t.id AND (ta2.owner_id = $13 OR $13 = ANY(ta2.collaborator_ids))
           ))
           AND ($14::text IS NULL OR t.visibility = $14)
           AND ($15::date IS NULL OR t.start_at::date >= $15)
           AND ($16::date IS NULL OR t.due_at::date <= $16)
           AND (
             $3::bool OR t.visibility IN ('normal', 'public') OR t.initiator_id = $4 OR t.owner_id = $4 OR t.acceptor_id = $4
             OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4)
             OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $4 OR $4 = ANY(ta.collaborator_ids)))
             OR p.visibility IN ('normal', 'public') OR p.leader_id = $4
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $4 AND pm.active)
             OR EXISTS (
               SELECT 1 FROM visibility_grants vg WHERE vg.object_type IN ('task','project') AND vg.object_id IN (t.id, t.project_id)
                 AND ((vg.subject_type = 'person' AND vg.subject_id = $4) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($5)))
                 AND (vg.expires_at IS NULL OR vg.expires_at > now())
             )
           )
         ORDER BY t.created_at DESC LIMIT $6 OFFSET $7",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(query.limit())
    .bind(query.offset())
    .bind(query.sub_type.clone())
    .bind(query.priority.clone())
    .bind(query.org_id)
    .bind(query.project_id)
    .bind(query.owner_id)
    .bind(query.member_id)
    .bind(query.visibility.clone())
    .bind(query.start_date)
    .bind(query.end_date)
    .fetch_all(&state.db)
    .await?;
    let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
    Ok(Json(json!({
        "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "total": total
    })))
}

async fn get_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_task_visible(&state.db, &user, id).await?;
    let task = get_json_by_id(&state.db, "tasks", id).await?;
    let members =
        sqlx::query("SELECT to_jsonb(task_members.*) AS item FROM task_members WHERE task_id = $1")
            .bind(id)
            .fetch_all(&state.db)
            .await?;
    let assignments = sqlx::query("SELECT to_jsonb(task_assignments.*) AS item FROM task_assignments WHERE task_id = $1 ORDER BY created_at")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(json!({
        "task": task,
        "members": members.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "assignments": assignments.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "available_actions": task_available_actions(&task, &user)
    })))
}

fn task_available_actions(task: &Value, user: &CurrentUser) -> Vec<&'static str> {
    let status = task.get("status").and_then(Value::as_str).unwrap_or("");
    let mut actions = Vec::new();
    if user.is_sa() || user.actions.contains("task.dispatch") {
        match status {
            "draft" => actions.push("submit"),
            "coordination_pending" => actions.push("confirm"),
            "confirmation_pending" => actions.push("start"),
            "in_progress" | "risk" | "acceptance_rejected" => {
                actions.push("pause");
                actions.push("submit_acceptance");
            }
            "acceptance_pending" => {
                actions.push("accept");
                actions.push("reject");
            }
            "completed" => actions.push("archive"),
            _ => {}
        }
    }
    actions
}

async fn create_task(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.create")?;
    let task_no = value_str(
        &payload,
        "task_no",
        &format!("TASK-{}", Utc::now().timestamp_millis()),
    );
    let status = value_str(&payload, "status", "draft");
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO tasks(task_no, name, sub_type, level, priority, owner_org_id, project_id, visibility, initiator_id, owner_id, acceptor_id, start_at, due_at, estimated_total_hours, summary, deliverable_requirement, status, payload, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING id",
    )
    .bind(task_no.clone())
    .bind(value_str(&payload, "name", ""))
    .bind(payload.get("sub_type").and_then(Value::as_str))
    .bind(value_str(&payload, "level", "normal"))
    .bind(value_str(&payload, "priority", "normal"))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "project_id"))
    .bind(value_str(&payload, "visibility", "normal"))
    .bind(user.person_id)
    .bind(value_uuid(&payload, "owner_id").or(user.person_id))
    .bind(value_uuid(&payload, "acceptor_id"))
    .bind(parse_datetime(&payload, "start_at"))
    .bind(parse_datetime(&payload, "due_at"))
    .bind(value_f64(&payload, "estimated_total_hours", 0.0))
    .bind(value_str(&payload, "summary", ""))
    .bind(value_str(&payload, "deliverable_requirement", ""))
    .bind(status)
    .bind(payload.clone())
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;

    if let Some(members) = payload.get("members").and_then(Value::as_array) {
        for member in members {
            insert_task_member(&state.db, id, member).await?;
        }
    }
    upsert_search(
        &state.db,
        "task",
        id,
        &format!(
            "{} {} {}",
            task_no,
            value_str(&payload, "name", ""),
            value_str(&payload, "summary", "")
        ),
    )
    .await?;
    emit_event(
        &state.db,
        "task.created",
        "task",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn insert_task_member(db: &PgPool, task_id: Uuid, member: &Value) -> Result<(), ApiError> {
    let person_id = value_uuid(member, "person_id")
        .ok_or_else(|| ApiError::bad_request("member.person_id is required"))?;
    sqlx::query(
        "INSERT INTO task_members(task_id, person_id, member_role, work_content, estimated_total_hours, daily_commitment_type, daily_commitment_hours, start_date, due_date, approval_status, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (task_id, person_id, member_role) DO UPDATE SET
           work_content = EXCLUDED.work_content,
           estimated_total_hours = EXCLUDED.estimated_total_hours,
           daily_commitment_type = EXCLUDED.daily_commitment_type,
           daily_commitment_hours = EXCLUDED.daily_commitment_hours,
           start_date = EXCLUDED.start_date,
           due_date = EXCLUDED.due_date,
           approval_status = EXCLUDED.approval_status,
           payload = EXCLUDED.payload",
    )
    .bind(task_id)
    .bind(person_id)
    .bind(value_str(member, "member_role", "member"))
    .bind(value_str(member, "work_content", ""))
    .bind(value_f64(member, "estimated_total_hours", 0.0))
    .bind(value_str(member, "daily_commitment_type", "hours"))
    .bind(value_f64(member, "daily_commitment_hours", 0.0))
    .bind(parse_date(member, "start_date"))
    .bind(parse_date(member, "due_date"))
    .bind(value_str(member, "approval_status", "pending"))
    .bind(member.clone())
    .execute(db)
    .await?;
    Ok(())
}

async fn update_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_task_editable(&state.db, &user, id).await?;
    let before = get_json_by_id(&state.db, "tasks", id).await?;
    if before.get("status").and_then(Value::as_str) == Some("archived") {
        return Err(ApiError::conflict("archived task is readonly"));
    }
    sqlx::query(
        "UPDATE tasks SET
          name = COALESCE($2, name),
          sub_type = COALESCE($3, sub_type),
          level = COALESCE($4, level),
          priority = COALESCE($5, priority),
          owner_org_id = COALESCE($6, owner_org_id),
          project_id = COALESCE($7, project_id),
          visibility = COALESCE($8, visibility),
          owner_id = COALESCE($9, owner_id),
          acceptor_id = COALESCE($10, acceptor_id),
          start_at = COALESCE($11, start_at),
          due_at = COALESCE($12, due_at),
          estimated_total_hours = COALESCE($13, estimated_total_hours),
          summary = COALESCE($14, summary),
          deliverable_requirement = COALESCE($15, deliverable_requirement),
          payload = payload || $16,
          updated_at = now(), updated_by = $17, version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("sub_type").and_then(Value::as_str))
    .bind(payload.get("level").and_then(Value::as_str))
    .bind(payload.get("priority").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "project_id"))
    .bind(payload.get("visibility").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_id"))
    .bind(value_uuid(&payload, "acceptor_id"))
    .bind(parse_datetime(&payload, "start_at"))
    .bind(parse_datetime(&payload, "due_at"))
    .bind(payload.get("estimated_total_hours").and_then(Value::as_f64))
    .bind(payload.get("summary").and_then(Value::as_str))
    .bind(
        payload
            .get("deliverable_requirement")
            .and_then(Value::as_str),
    )
    .bind(payload.clone())
    .bind(user.person_id)
    .execute(&state.db)
    .await?;
    if let Some(members) = payload.get("members").and_then(Value::as_array) {
        sqlx::query("DELETE FROM task_members WHERE task_id = $1")
            .bind(id)
            .execute(&state.db)
            .await?;
        for member in members {
            insert_task_member(&state.db, id, member).await?;
        }
    }
    let (task_no, name, summary) =
        sqlx::query_as::<_, (String, String, String)>(
            "SELECT task_no, name, summary FROM tasks WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    upsert_search(
        &state.db,
        "task",
        id,
        &format!("{task_no} {name} {summary}"),
    )
    .await?;
    sqlx::query("INSERT INTO task_change_logs(task_id, changed_by, change_type, reason, before_payload, after_payload) VALUES ($1,$2,'task.updated',$3,$4,$5)")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "reason", ""))
        .bind(before)
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "task.changed",
        "task",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn transition_task(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    from: &[&str],
    to: &str,
    event: &str,
    payload: Value,
) -> Result<Json<Value>, ApiError> {
    ensure_task_editable(db, user, id).await?;
    let current: String = sqlx::query_scalar("SELECT status FROM tasks WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| ApiError::not_found("task not found"))?;
    if !from.contains(&current.as_str()) {
        return Err(ApiError::conflict(format!(
            "invalid task transition: {current} -> {to}"
        )));
    }
    sqlx::query("UPDATE tasks SET status = $2, updated_at = now(), updated_by = $3, version = version + 1 WHERE id = $1")
        .bind(id)
        .bind(to)
        .bind(user.person_id)
        .execute(db)
        .await?;
    sqlx::query("INSERT INTO task_change_logs(task_id, changed_by, change_type, reason, after_payload) VALUES ($1,$2,$3,$4,$5)")
        .bind(id)
        .bind(user.person_id)
        .bind(event)
        .bind(value_str(&payload, "reason", ""))
        .bind(json!({ "from": current, "to": to, "payload": payload }))
        .execute(db)
        .await?;
    emit_event(
        db,
        event,
        "task",
        Some(id),
        user.person_id,
        json!({ "from": current, "to": to }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": to })))
}
