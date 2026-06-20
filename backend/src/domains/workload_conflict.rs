async fn preview_person_load(
    db: &PgPool,
    person_id: Uuid,
    start: NaiveDate,
    end: NaiveDate,
    daily_hours: f64,
    full_day: bool,
) -> Result<Value, ApiError> {
    let standard_hours = sqlx::query_scalar::<_, f64>(
        "SELECT daily_standard_hours::float8 FROM persons WHERE id = $1",
    )
    .bind(person_id)
    .fetch_optional(db)
    .await?
    .unwrap_or(8.0);
    let mut date = start;
    let mut days = Vec::new();
    let mut conflicts = Vec::new();
    while date <= end {
        let existing = sqlx::query(
            "SELECT COALESCE(committed_hours::float8, 0) AS committed_hours, COALESCE(full_day_occupied, false) AS full_day_occupied
             FROM workload_snapshots WHERE person_id = $1 AND work_date = $2",
        )
        .bind(person_id)
        .bind(date)
        .fetch_optional(db)
        .await?;
        let (existing_hours, existing_full_day) = existing
            .map(|r| {
                (
                    r.get::<f64, _>("committed_hours"),
                    r.get::<bool, _>("full_day_occupied"),
                )
            })
            .unwrap_or((0.0, false));
        let committed = if full_day {
            standard_hours
        } else {
            daily_hours
        };
        let total = existing_hours + committed;
        let load_rate = if standard_hours > 0.0 {
            total / standard_hours
        } else {
            0.0
        };
        if total > standard_hours {
            conflicts.push(json!({ "type": "overload", "date": date, "overload_hours": total - standard_hours, "risk_level": if load_rate >= 1.5 { "high" } else { "medium" } }));
        }
        if full_day && existing_hours > 0.0 || existing_full_day {
            conflicts
                .push(json!({ "type": "full_day_overlap", "date": date, "risk_level": "high" }));
        }
        days.push(json!({ "date": date, "existing_hours": existing_hours, "new_hours": committed, "total_hours": total, "standard_hours": standard_hours, "load_rate": load_rate }));
        date = date
            .succ_opt()
            .ok_or_else(|| ApiError::bad_request("invalid date range"))?;
    }
    Ok(
        json!({ "person_id": person_id, "start": start, "end": end, "days": days, "conflicts": conflicts }),
    )
}

async fn workload_preview(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let person_id = value_uuid(&payload, "person_id")
        .ok_or_else(|| ApiError::bad_request("person_id is required"))?;
    let start = parse_date(&payload, "start_date")
        .ok_or_else(|| ApiError::bad_request("start_date is required"))?;
    let end = parse_date(&payload, "due_date")
        .ok_or_else(|| ApiError::bad_request("due_date is required"))?;
    Ok(Json(
        preview_person_load(
            &state.db,
            person_id,
            start,
            end,
            value_f64(&payload, "daily_commitment_hours", 0.0),
            value_str(&payload, "daily_commitment_type", "hours") == "full_day",
        )
        .await?,
    ))
}

async fn recalculate_task_workload(db: &PgPool, task_id: Uuid) -> Result<(), ApiError> {
    let members = sqlx::query(
        "SELECT person_id, daily_commitment_type, daily_commitment_hours::float8 AS daily_hours, start_date, due_date
         FROM task_members WHERE task_id = $1",
    )
    .bind(task_id)
    .fetch_all(db)
    .await?;
    for row in members {
        let person_id: Uuid = row.get("person_id");
        let start: Option<NaiveDate> = row.try_get("start_date").ok();
        let end: Option<NaiveDate> = row.try_get("due_date").ok();
        let daily_type: String = row.get("daily_commitment_type");
        let daily_hours: f64 = row.get("daily_hours");
        if let (Some(start), Some(end)) = (start, end) {
            write_workload_range(
                db,
                person_id,
                task_id,
                None,
                start,
                end,
                daily_hours,
                daily_type == "full_day",
            )
            .await?;
        }
    }
    let assignments = sqlx::query(
        "SELECT id, owner_id, daily_commitment_type, daily_commitment_hours::float8 AS daily_hours, start_date, due_date
         FROM task_assignments WHERE task_id = $1",
    )
    .bind(task_id)
    .fetch_all(db)
    .await?;
    for row in assignments {
        let assignment_id: Uuid = row.get("id");
        let person_id: Uuid = row.get("owner_id");
        let start: Option<NaiveDate> = row.try_get("start_date").ok();
        let end: Option<NaiveDate> = row.try_get("due_date").ok();
        let daily_type: String = row.get("daily_commitment_type");
        let daily_hours: f64 = row.get("daily_hours");
        if let (Some(start), Some(end)) = (start, end) {
            write_workload_range(
                db,
                person_id,
                task_id,
                Some(assignment_id),
                start,
                end,
                daily_hours,
                daily_type == "full_day",
            )
            .await?;
        }
    }
    Ok(())
}

async fn write_workload_range(
    db: &PgPool,
    person_id: Uuid,
    task_id: Uuid,
    assignment_id: Option<Uuid>,
    start: NaiveDate,
    end: NaiveDate,
    daily_hours: f64,
    full_day: bool,
) -> Result<(), ApiError> {
    let standard_hours = sqlx::query_scalar::<_, f64>(
        "SELECT daily_standard_hours::float8 FROM persons WHERE id = $1",
    )
    .bind(person_id)
    .fetch_optional(db)
    .await?
    .unwrap_or(8.0);
    let mut date = start;
    while date <= end {
        let committed = if full_day {
            standard_hours
        } else {
            daily_hours
        };
        sqlx::query(
            "INSERT INTO workload_snapshots(person_id, work_date, committed_hours, standard_hours, load_rate, full_day_occupied, source_task_ids, source_assignment_ids)
             VALUES ($1,$2,$3,$4,$3 / NULLIF($4, 0),$5,ARRAY[$6]::uuid[],CASE WHEN $7::uuid IS NULL THEN '{}'::uuid[] ELSE ARRAY[$7]::uuid[] END)
             ON CONFLICT (person_id, work_date) DO UPDATE SET
               committed_hours = workload_snapshots.committed_hours + EXCLUDED.committed_hours,
               standard_hours = EXCLUDED.standard_hours,
               load_rate = (workload_snapshots.committed_hours + EXCLUDED.committed_hours) / NULLIF(EXCLUDED.standard_hours, 0),
               full_day_occupied = workload_snapshots.full_day_occupied OR EXCLUDED.full_day_occupied,
               source_task_ids = array(SELECT DISTINCT unnest(workload_snapshots.source_task_ids || EXCLUDED.source_task_ids)),
               source_assignment_ids = array(SELECT DISTINCT unnest(workload_snapshots.source_assignment_ids || EXCLUDED.source_assignment_ids)),
               updated_at = now()",
        )
        .bind(person_id)
        .bind(date)
        .bind(committed)
        .bind(standard_hours)
        .bind(full_day)
        .bind(task_id)
        .bind(assignment_id)
        .execute(db)
        .await?;
        let snap = sqlx::query("SELECT committed_hours::float8 AS committed_hours, load_rate::float8 AS load_rate, full_day_occupied FROM workload_snapshots WHERE person_id = $1 AND work_date = $2")
            .bind(person_id)
            .bind(date)
            .fetch_one(db)
            .await?;
        let committed_hours: f64 = snap.get("committed_hours");
        let load_rate: f64 = snap.get("load_rate");
        let full_day_occupied: bool = snap.get("full_day_occupied");
        if committed_hours > standard_hours
            || (full_day && full_day_occupied && committed_hours > standard_hours)
        {
            let risk_level = if load_rate >= 1.5 { "high" } else { "medium" };
            sqlx::query(
                "INSERT INTO conflict_records(conflict_type, risk_level, person_id, task_id, assignment_id, conflict_date_start, conflict_date_end, overload_hours, payload)
                 VALUES ($1,$2,$3,$4,$5,$6,$6,GREATEST($7 - $8, 0),$9)",
            )
            .bind(if full_day { "full_day_overlap" } else { "overload" })
            .bind(risk_level)
            .bind(person_id)
            .bind(task_id)
            .bind(assignment_id)
            .bind(date)
            .bind(committed_hours)
            .bind(standard_hours)
            .bind(json!({ "load_rate": load_rate }))
            .execute(db)
            .await?;
        }
        date = date
            .succ_opt()
            .ok_or_else(|| ApiError::bad_request("invalid date range"))?;
    }
    Ok(())
}

async fn workload_person(
    State(state): State<Arc<AppState>>,
    Path(person_id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT jsonb_build_object('date', work_date, 'committed_hours', committed_hours::float8, 'standard_hours', standard_hours::float8, 'load_rate', load_rate::float8, 'full_day_occupied', full_day_occupied, 'source_task_ids', source_task_ids, 'source_assignment_ids', source_assignment_ids) AS item FROM workload_snapshots WHERE person_id = $1 ORDER BY work_date")
        .bind(person_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "person_id": person_id, "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn workload_calendar(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let start = query
        .get("start")
        .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Utc::now().date_naive());
    let end = query
        .get("end")
        .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
        .unwrap_or(start + Duration::days(30));
    let rows = sqlx::query("SELECT jsonb_build_object('person_id', person_id, 'date', work_date, 'committed_hours', committed_hours::float8, 'standard_hours', standard_hours::float8, 'load_rate', load_rate::float8, 'full_day_occupied', full_day_occupied) AS item FROM workload_snapshots WHERE work_date BETWEEN $1 AND $2 ORDER BY work_date")
        .bind(start)
        .bind(end)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "start": start, "end": end, "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn list_conflicts(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', c.id, 'conflict_type', c.conflict_type, 'risk_level', c.risk_level, 'person_id', c.person_id,
          'person_name', person.name, 'person_employee_no', person.employee_no, 'owner_org_name', org.name,
          'task_id', c.task_id, 'task_name', task.name, 'task_no', task.task_no, 'assignment_id', c.assignment_id, 'conflict_date_start', c.conflict_date_start,
          'conflict_date_end', c.conflict_date_end, 'overload_hours', c.overload_hours::float8, 'status', c.status,
          'handler_id', c.handler_id, 'resolution_action', c.resolution_action, 'resolution_comment', c.resolution_comment,
          'payload', c.payload, 'created_at', c.created_at
        ) AS item,
          count(*) OVER() AS total
         FROM conflict_records c
         LEFT JOIN tasks task ON task.id = c.task_id
         LEFT JOIN persons person ON person.id = c.person_id
         LEFT JOIN organizations org ON org.id = person.primary_org_id
         WHERE ($1::text IS NULL OR c.status = $1)
           AND ($4::text IS NULL OR c.conflict_type = $4)
           AND ($5::text IS NULL OR c.risk_level = $5)
           AND ($6::uuid IS NULL OR task.project_id = $6)
           AND ($7::uuid IS NULL OR $8::text IS NULL OR ($8 = 'task' AND c.task_id = $7) OR ($8 = 'assignment' AND c.assignment_id = $7))
         ORDER BY
           CASE c.risk_level WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
           c.created_at DESC
         LIMIT $2 OFFSET $3",
    )
    .bind(query.status.clone())
    .bind(query.limit())
    .bind(query.offset())
    .bind(query.conflict_type.clone())
    .bind(query.risk_level.clone())
    .bind(query.project_id)
    .bind(query.object_id)
    .bind(query.object_type.clone())
    .fetch_all(&state.db)
    .await?;
    let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?, "total": total }),
    ))
}

async fn get_conflict(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let row = sqlx::query(
        "SELECT jsonb_build_object(
          'id', c.id,
          'conflict_type', c.conflict_type,
          'risk_level', c.risk_level,
          'status', c.status,
          'person_id', c.person_id,
          'task_id', c.task_id,
          'assignment_id', c.assignment_id,
          'conflict_date_start', c.conflict_date_start,
          'conflict_date_end', c.conflict_date_end,
          'overload_hours', c.overload_hours::float8,
          'handler_id', c.handler_id,
          'resolution_action', c.resolution_action,
          'resolution_comment', c.resolution_comment,
          'payload', c.payload,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'person', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'employee_no', p.employee_no,
            'work_status', p.work_status,
            'daily_standard_hours', p.daily_standard_hours::float8,
            'primary_org_id', p.primary_org_id,
            'primary_org_name', org.name
          ) END,
          'task', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', t.id,
            'task_no', t.task_no,
            'name', t.name,
            'status', t.status,
            'priority', t.priority,
            'start_at', t.start_at,
            'due_at', t.due_at,
            'progress', t.progress::float8,
            'project_id', t.project_id,
            'project_name', pr.name
          ) END,
          'assignment', CASE WHEN ta.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', ta.id,
            'title', ta.title,
            'status', ta.status,
            'owner_id', ta.owner_id,
            'start_date', ta.start_date,
            'due_date', ta.due_date,
            'daily_commitment_hours', ta.daily_commitment_hours::float8,
            'daily_commitment_type', ta.daily_commitment_type
          ) END,
          'related_workload', COALESCE(workload.items, '[]'::jsonb),
          'events', COALESCE(events.items, '[]'::jsonb),
          'audits', COALESCE(audits.items, '[]'::jsonb)
        ) AS item
        FROM conflict_records c
        LEFT JOIN persons p ON p.id = c.person_id
        LEFT JOIN organizations org ON org.id = p.primary_org_id
        LEFT JOIN tasks t ON t.id = c.task_id
        LEFT JOIN projects pr ON pr.id = t.project_id
        LEFT JOIN task_assignments ta ON ta.id = c.assignment_id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
            'date', ws.work_date,
            'committed_hours', ws.committed_hours::float8,
            'standard_hours', ws.standard_hours::float8,
            'load_rate', ws.load_rate::float8,
            'full_day_occupied', ws.full_day_occupied,
            'source_task_ids', ws.source_task_ids
          ) ORDER BY ws.work_date) AS items
          FROM workload_snapshots ws
          WHERE ws.person_id = c.person_id
            AND ws.work_date BETWEEN COALESCE(c.conflict_date_start, current_date) - interval '3 days'
                                AND COALESCE(c.conflict_date_end, current_date) + interval '3 days'
        ) workload ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            to_jsonb(de) || jsonb_build_object('actor_name', actor.name)
            ORDER BY de.created_at DESC
          ) AS items
          FROM domain_events de
          LEFT JOIN persons actor ON actor.id = de.actor_id
          WHERE de.object_type = 'conflict_record' AND de.object_id = c.id
        ) events ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(to_jsonb(al) ORDER BY al.created_at DESC) AS items
          FROM audit_logs al
          WHERE al.object_type = 'conflict_record' AND al.object_id = c.id
        ) audits ON true
        WHERE c.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;
    let Some(row) = row else {
        return Err(ApiError::not_found("conflict not found"));
    };
    Ok(Json(json_row(&row, "item")?))
}

async fn resolve_conflict(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    sqlx::query("UPDATE conflict_records SET status = 'resolved', handler_id = $2, resolution_action = $3, resolution_comment = $4, updated_at = now(), payload = payload || $5 WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "resolution_action", "resolved"))
        .bind(value_str(&payload, "resolution_comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "conflict.resolved",
        "conflict_record",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "resolved" })))
}

async fn force_conflict(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.approve")?;
    if value_str(&payload, "reason", "").is_empty() {
        return Err(ApiError::bad_request(
            "reason is required for force schedule",
        ));
    }
    sqlx::query("UPDATE conflict_records SET status = 'forced', handler_id = $2, resolution_action = 'force', resolution_comment = $3, updated_at = now(), payload = payload || $4 WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "reason", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    audit(
        &state.db,
        user.person_id,
        "conflict_record",
        Some(id),
        "conflict.force",
        json!({}),
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "forced" })))
}

async fn recalculate_conflicts(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    if let Some(task_id) = value_uuid(&payload, "task_id") {
        recalculate_task_workload(&state.db, task_id).await?;
        Ok(Json(json!({ "task_id": task_id, "recalculated": true })))
    } else {
        Err(ApiError::bad_request(
            "task_id is required for recalculation",
        ))
    }
}
