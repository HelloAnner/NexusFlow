async fn gantt(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let start = query
        .get("start")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let end = query
        .get("end")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', t.id, 'type', 'task', 'title', CASE WHEN p.visibility = 'hidden' AND NOT $3::bool THEN '[隐藏任务]' ELSE t.name END,
          'start', t.start_at, 'end', t.due_at, 'progress', t.progress::float8, 'status', t.status,
          'risk_level', COALESCE((SELECT max(risk_level) FROM conflict_records c WHERE c.task_id = t.id AND c.status = 'open'), 'none'),
          'target_url', '/tasks/' || t.id::text, 'readonly', t.status = 'archived'
        ) AS item
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL
           AND ($1::timestamptz IS NULL OR t.due_at >= $1)
           AND ($2::timestamptz IS NULL OR t.start_at <= $2)
           AND ($3::bool OR t.visibility = 'normal' OR t.owner_id = $4 OR t.initiator_id = $4 OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4))
         ORDER BY t.start_at NULLS LAST LIMIT 500",
    )
    .bind(start)
    .bind(end)
    .bind(user.is_sa())
    .bind(user.person_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn gantt_summary(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let row = sqlx::query(
        "SELECT
          count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
          count(*) FILTER (WHERE status = 'acceptance_pending') AS acceptance_pending,
          count(*) FILTER (WHERE status = 'archived') AS archived
         FROM tasks WHERE deleted_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "in_progress": row.get::<i64, _>("in_progress"),
        "acceptance_pending": row.get::<i64, _>("acceptance_pending"),
        "archived": row.get::<i64, _>("archived")
    })))
}

async fn search(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let q = query.get("q").cloned().unwrap_or_default();
    let can_search_people = user.is_sa() || user.actions.contains("person.manage");
    let rows = sqlx::query(
        "WITH results AS (
          SELECT
            'task'::text AS object_type,
            t.id AS object_id,
            t.name AS title,
            concat_ws(' ', t.task_no, t.name, t.summary, t.status) AS search_text,
            t.status AS status,
            t.updated_at AS updated_at,
            '/tasks/' || t.id::text AS target_url
          FROM tasks t
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.deleted_at IS NULL
            AND ($1 = '' OR concat_ws(' ', t.task_no, t.name, t.summary, t.status) ILIKE '%' || $1 || '%')
            AND (
              $2::bool
              OR (t.visibility = 'normal' AND COALESCE(p.visibility, 'public') IN ('normal', 'public'))
              OR t.owner_id = $3
              OR t.initiator_id = $3
              OR t.acceptor_id = $3
              OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $3)
              OR EXISTS (
                SELECT 1 FROM visibility_grants vg
                WHERE vg.object_type = 'project'
                  AND vg.object_id = p.id
                  AND ((vg.subject_type = 'person' AND vg.subject_id = $3) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($4)))
                  AND (vg.expires_at IS NULL OR vg.expires_at > now())
              )
            )

          UNION ALL

          SELECT
            'project'::text,
            p.id,
            p.name,
            concat_ws(' ', p.project_no, p.name, p.summary, p.status, p.project_type),
            p.status,
            p.updated_at,
            '/projects'
          FROM projects p
          WHERE p.deleted_at IS NULL
            AND ($1 = '' OR concat_ws(' ', p.project_no, p.name, p.summary, p.status, p.project_type) ILIKE '%' || $1 || '%')
            AND (
              $2::bool
              OR p.visibility IN ('normal', 'public')
              OR p.leader_id = $3
              OR p.managed_by_id = $3
              OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $3 AND pm.active)
              OR EXISTS (
                SELECT 1 FROM visibility_grants vg
                WHERE vg.object_type = 'project'
                  AND vg.object_id = p.id
                  AND ((vg.subject_type = 'person' AND vg.subject_id = $3) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($4)))
                  AND (vg.expires_at IS NULL OR vg.expires_at > now())
              )
            )

          UNION ALL

          SELECT
            'person'::text,
            p.id,
            p.name,
            concat_ws(' ', p.employee_no, p.name, p.work_status, a.login_name),
            p.work_status,
            p.updated_at,
            '/people'
          FROM persons p
          LEFT JOIN accounts a ON a.person_id = p.id
          WHERE p.deleted_at IS NULL
            AND ($5::bool OR p.id = $3)
            AND ($1 = '' OR concat_ws(' ', p.employee_no, p.name, p.work_status, a.login_name) ILIKE '%' || $1 || '%')

          UNION ALL

          SELECT
            'resource'::text,
            r.id,
            r.name,
            concat_ws(' ', r.name, r.resource_type, r.status),
            r.status,
            r.updated_at,
            '/resources'
          FROM resource_files r
          WHERE ($2::bool OR r.visibility = 'normal' OR r.uploader_id = $3)
            AND ($1 = '' OR concat_ws(' ', r.name, r.resource_type, r.status) ILIKE '%' || $1 || '%')
        )
        SELECT jsonb_build_object(
          'object_type', object_type,
          'object_id', object_id,
          'title', title,
          'summary', search_text,
          'status', status,
          'target_url', target_url,
          'updated_at', updated_at
        ) AS item
        FROM results
        ORDER BY
          CASE WHEN title ILIKE $1 || '%' THEN 0 ELSE 1 END,
          updated_at DESC
        LIMIT 50",
    )
    .bind(q)
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(can_search_people)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn search_suggest(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    search(State(state), user, Query(query)).await
}

async fn list_saved_filters(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(saved_filters.*) AS item FROM saved_filters WHERE owner_id = $1 ORDER BY created_at DESC")
        .bind(user.person_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_saved_filter(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO saved_filters(owner_id, filter_type, name, payload) VALUES ($1,$2,$3,$4) RETURNING id",
    )
    .bind(user.person_id)
    .bind(value_str(&payload, "filter_type", "task"))
    .bind(value_str(&payload, "name", ""))
    .bind(payload)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": id })))
}
