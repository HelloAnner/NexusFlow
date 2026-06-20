async fn list_projects(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let scope = data_scope_context(&state.db, &user).await?;
    let rows = sqlx::query(
        "SELECT (
          to_jsonb(p.*)
          || jsonb_build_object(
            'payload',
            p.payload || jsonb_build_object(
              'leader_name', leader.name,
              'managed_by_name', manager.name,
              'owner_org_name', org.name
            )
          )
        ) AS item,
          count(*) OVER() AS total
         FROM projects p
         LEFT JOIN persons leader ON leader.id = p.leader_id
         LEFT JOIN persons manager ON manager.id = p.managed_by_id
         LEFT JOIN organizations org ON org.id = p.owner_org_id
         WHERE p.deleted_at IS NULL
           AND ($1::text IS NULL OR concat_ws(' ', p.name, p.project_no, p.summary, leader.name, manager.name, org.name) ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR p.status = $2)
           AND ($8::uuid IS NULL OR p.owner_org_id = $8)
           AND ($9::uuid IS NULL OR p.leader_id = $9 OR p.managed_by_id = $9 OR EXISTS (
             SELECT 1 FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.person_id = $9 AND pm2.active
           ))
           AND ($10::text IS NULL OR p.visibility = $10)
           AND ($11::text IS NULL OR p.project_type = $11)
           AND (
             $3::bool OR p.visibility IN ('normal', 'public') OR p.leader_id = $4 OR EXISTS (
               SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $4 AND pm.active
             ) OR EXISTS (
               SELECT 1 FROM visibility_grants vg WHERE vg.object_type = 'project' AND vg.object_id = p.id
                 AND ((vg.subject_type = 'person' AND vg.subject_id = $4) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($5)))
               AND (vg.expires_at IS NULL OR vg.expires_at > now())
             )
           )
           AND (
             $12::bool
             OR p.leader_id = $4 OR p.managed_by_id = $4
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $4 AND pm.active)
             OR (($13::bool OR p.owner_org_id = ANY($15)) AND ($14::bool OR p.id = ANY($16)))
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
    .bind(query.project_type.clone())
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
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
    Ok(Json(project_detail_workbench(&state.db, &user, id).await?))
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
        payload.clone(),
    )
    .await?;
    emit_event(
        &state.db,
        "person.project_membership.changed",
        "person",
        Some(person_id),
        user.person_id,
        json!({
            "project_id": id,
            "project_role": value_str(&payload, "project_role", "member"),
            "work_desc": value_str(&payload, "work_desc", ""),
            "active": true
        }),
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
        payload.clone(),
    )
    .await?;
    emit_event(
        &state.db,
        "person.project_membership.changed",
        "person",
        Some(person_id),
        user.person_id,
        json!({
            "project_id": id,
            "project_role": payload.get("project_role").and_then(Value::as_str),
            "work_desc": payload.get("work_desc").and_then(Value::as_str),
            "active": payload.get("active").and_then(Value::as_bool)
        }),
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
    emit_event(
        &state.db,
        "person.project_membership.changed",
        "person",
        Some(person_id),
        user.person_id,
        json!({ "project_id": id, "active": false }),
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
