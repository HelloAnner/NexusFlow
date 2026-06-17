async fn list_projects(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(p.*) AS item,
          count(*) OVER() AS total
         FROM projects p
         WHERE p.deleted_at IS NULL
           AND ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.project_no ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR p.status = $2)
           AND ($8::uuid IS NULL OR p.owner_org_id = $8)
           AND ($9::uuid IS NULL OR p.leader_id = $9 OR p.managed_by_id = $9 OR EXISTS (
             SELECT 1 FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.person_id = $9 AND pm2.active
           ))
           AND ($10::text IS NULL OR p.visibility = $10)
           AND (
             $3::bool OR p.visibility IN ('normal', 'public') OR p.leader_id = $4 OR EXISTS (
               SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $4 AND pm.active
             ) OR EXISTS (
               SELECT 1 FROM visibility_grants vg WHERE vg.object_type = 'project' AND vg.object_id = p.id
                 AND ((vg.subject_type = 'person' AND vg.subject_id = $4) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($5)))
                 AND (vg.expires_at IS NULL OR vg.expires_at > now())
             )
           )
         ORDER BY p.created_at DESC LIMIT $6 OFFSET $7",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(query.limit())
    .bind(query.offset())
    .bind(query.org_id)
    .bind(query.member_id.or(query.owner_id))
    .bind(query.visibility.clone())
    .fetch_all(&state.db)
    .await?;
    let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
    Ok(Json(json!({
        "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "total": total
    })))
}

async fn get_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_visible(&state.db, &user, id).await?;
    Ok(Json(get_json_by_id(&state.db, "projects", id).await?))
}

async fn create_project(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("project.create")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO projects(project_no, name, project_type, level, owner_org_id, leader_id, managed_by_id, status, visibility, start_date, end_date, summary, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
    )
    .bind(value_str(&payload, "project_no", &format!("PRJ-{}", Utc::now().timestamp_millis())))
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "project_type", "other"))
    .bind(value_str(&payload, "level", "custom"))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "leader_id").or(user.person_id))
    .bind(value_uuid(&payload, "managed_by_id"))
    .bind(value_str(&payload, "status", "preparing"))
    .bind(value_str(&payload, "visibility", "normal"))
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "end_date"))
    .bind(value_str(&payload, "summary", ""))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    if let Some(pid) = user.person_id {
        sqlx::query("INSERT INTO project_members(project_id, person_id, project_role, work_desc) VALUES ($1,$2,'leader','项目负责人') ON CONFLICT DO NOTHING")
            .bind(id)
            .bind(pid)
            .execute(&state.db)
            .await?;
    }
    upsert_search(
        &state.db,
        "project",
        id,
        &format!(
            "{} {}",
            value_str(&payload, "project_no", ""),
            value_str(&payload, "name", "")
        ),
    )
    .await?;
    emit_event(
        &state.db,
        "project.created",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    let before = get_json_by_id(&state.db, "projects", id).await?;
    sqlx::query(
        "UPDATE projects SET
          name = COALESCE($2, name),
          project_type = COALESCE($3, project_type),
          level = COALESCE($4, level),
          owner_org_id = COALESCE($5, owner_org_id),
          leader_id = COALESCE($6, leader_id),
          managed_by_id = COALESCE($7, managed_by_id),
          status = COALESCE($8, status),
          visibility = COALESCE($9, visibility),
          start_date = COALESCE($10, start_date),
          end_date = COALESCE($11, end_date),
          summary = COALESCE($12, summary),
          payload = payload || $13,
          updated_at = now(),
          version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("project_type").and_then(Value::as_str))
    .bind(payload.get("level").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "leader_id"))
    .bind(value_uuid(&payload, "managed_by_id"))
    .bind(payload.get("status").and_then(Value::as_str))
    .bind(payload.get("visibility").and_then(Value::as_str))
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "end_date"))
    .bind(payload.get("summary").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    let (project_no, name, summary) =
        sqlx::query_as::<_, (String, String, String)>(
            "SELECT project_no, name, summary FROM projects WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    upsert_search(
        &state.db,
        "project",
        id,
        &format!("{project_no} {name} {summary}"),
    )
    .await?;
    audit(
        &state.db,
        user.person_id,
        "project",
        Some(id),
        "project.updated",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "project.updated",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn add_project_member(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    let person_id = value_uuid(&payload, "person_id")
        .ok_or_else(|| ApiError::bad_request("person_id is required"))?;
    sqlx::query(
        "INSERT INTO project_members(project_id, person_id, project_role, work_desc, org_snapshot, active)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (project_id, person_id) DO UPDATE
         SET project_role = EXCLUDED.project_role, work_desc = EXCLUDED.work_desc, active = true, left_at = NULL",
    )
    .bind(id)
    .bind(person_id)
    .bind(value_str(&payload, "project_role", "member"))
    .bind(value_str(&payload, "work_desc", ""))
    .bind(payload.get("org_snapshot").cloned().unwrap_or_else(|| json!({})))
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "project.member_changed",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "project_id": id, "person_id": person_id })))
}

async fn update_project_member(
    State(state): State<Arc<AppState>>,
    Path((id, person_id)): Path<(Uuid, Uuid)>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    sqlx::query("UPDATE project_members SET project_role = COALESCE($3, project_role), work_desc = COALESCE($4, work_desc), active = COALESCE($5, active) WHERE project_id = $1 AND person_id = $2")
        .bind(id)
        .bind(person_id)
        .bind(payload.get("project_role").and_then(Value::as_str))
        .bind(payload.get("work_desc").and_then(Value::as_str))
        .bind(payload.get("active").and_then(Value::as_bool))
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "project.member_changed",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "project_id": id, "person_id": person_id })))
}

async fn delete_project_member(
    State(state): State<Arc<AppState>>,
    Path((id, person_id)): Path<(Uuid, Uuid)>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    sqlx::query("UPDATE project_members SET active = false, left_at = now() WHERE project_id = $1 AND person_id = $2")
        .bind(id)
        .bind(person_id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "project.member_changed",
        "project",
        Some(id),
        user.person_id,
        json!({ "person_id": person_id, "active": false }),
    )
    .await?;
    Ok(Json(
        json!({ "project_id": id, "person_id": person_id, "active": false }),
    ))
}

async fn project_visibility_grant(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(mut payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    payload["object_type"] = json!("project");
    payload["object_id"] = json!(id);
    create_visibility_grant(State(state), user, Json(payload)).await
}

async fn archive_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    sqlx::query("UPDATE projects SET status = 'archived', updated_at = now(), version = version + 1 WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "project.archived",
        "project",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "archived" })))
}

async fn project_stats(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_visible(&state.db, &user, id).await?;
    let row = sqlx::query(
        "SELECT
          (SELECT count(*) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL) AS task_count,
          (SELECT count(*) FROM project_members WHERE project_id = $1 AND active) AS member_count,
          (SELECT count(*) FROM resource_links WHERE object_type = 'project' AND object_id = $1) AS resource_count",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "project_id": id,
        "task_count": row.get::<i64, _>("task_count"),
        "member_count": row.get::<i64, _>("member_count"),
        "resource_count": row.get::<i64, _>("resource_count")
    })))
}

async fn ensure_project_visible(
    db: &PgPool,
    user: &CurrentUser,
    project_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() {
        return Ok(());
    }
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = $1 AND p.deleted_at IS NULL AND (
            p.visibility = 'normal' OR p.leader_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $2 AND pm.active
            ) OR EXISTS (
              SELECT 1 FROM visibility_grants vg WHERE vg.object_type = 'project' AND vg.object_id = p.id
                AND ((vg.subject_type = 'person' AND vg.subject_id = $2) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($3)))
                AND (vg.expires_at IS NULL OR vg.expires_at > now())
            )
          )
        )",
    )
    .bind(project_id)
    .bind(user.person_id)
    .bind(&user.role_ids)
    .fetch_one(db)
    .await?;
    if visible {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "project is hidden or out of data scope",
        ))
    }
}

async fn ensure_project_manageable(
    db: &PgPool,
    user: &CurrentUser,
    project_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() || user.actions.contains("project.manage") {
        return Ok(());
    }
    let manageable = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND leader_id = $2)",
    )
    .bind(project_id)
    .bind(user.person_id)
    .fetch_one(db)
    .await?;
    if manageable {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "project is not manageable by current user",
        ))
    }
}

async fn ensure_task_visible(
    db: &PgPool,
    user: &CurrentUser,
    task_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() {
        return Ok(());
    }
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM tasks t
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.id = $1 AND t.deleted_at IS NULL AND (
            t.visibility = 'normal' OR t.initiator_id = $2 OR t.owner_id = $2 OR t.acceptor_id = $2 OR EXISTS (
              SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $2
            ) OR EXISTS (
              SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $2 OR $2 = ANY(ta.collaborator_ids))
            ) OR p.visibility = 'normal' OR p.leader_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $2 AND pm.active
            ) OR EXISTS (
              SELECT 1 FROM visibility_grants vg WHERE vg.object_type IN ('task','project') AND vg.object_id IN (t.id, t.project_id)
                AND ((vg.subject_type = 'person' AND vg.subject_id = $2) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($3)))
                AND (vg.expires_at IS NULL OR vg.expires_at > now())
            )
          )
        )",
    )
    .bind(task_id)
    .bind(user.person_id)
    .bind(&user.role_ids)
    .fetch_one(db)
    .await?;
    if visible {
        Ok(())
    } else {
        Err(ApiError::forbidden("task is hidden or out of data scope"))
    }
}

async fn ensure_task_editable(
    db: &PgPool,
    user: &CurrentUser,
    task_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() || user.actions.contains("task.dispatch") {
        return Ok(());
    }
    let editable = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1 AND (initiator_id = $2 OR owner_id = $2) AND status <> 'archived')")
        .bind(task_id)
        .bind(user.person_id)
        .fetch_one(db)
        .await?;
    if editable {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "task is not editable by current user or already archived",
        ))
    }
}

async fn upsert_search(
    db: &PgPool,
    object_type: &str,
    object_id: Uuid,
    text: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO search_index_meta(object_type, object_id, search_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (object_type, object_id) DO UPDATE SET search_text = EXCLUDED.search_text, updated_at = now()",
    )
    .bind(object_type)
    .bind(object_id)
    .bind(text)
    .execute(db)
    .await?;
    Ok(())
}
