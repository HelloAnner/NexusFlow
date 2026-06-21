async fn gantt(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let scope = data_scope_context(&state.db, &user).await?;
    let start = query
        .get("start")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let end = query
        .get("end")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let project_id = query
        .get("project_id")
        .filter(|v| !v.is_empty())
        .and_then(|v| Uuid::parse_str(v).ok());
    let owner_id = query
        .get("owner_id")
        .filter(|v| !v.is_empty())
        .and_then(|v| Uuid::parse_str(v).ok());
    let org_id = query
        .get("org_id")
        .filter(|v| !v.is_empty())
        .and_then(|v| Uuid::parse_str(v).ok());
    let status = query.get("status").filter(|v| !v.is_empty()).cloned();
    let risk_only = query.get("risk_only").map(|v| v == "1" || v == "true").unwrap_or(false);
    let rows = sqlx::query(
        "WITH visible_tasks AS (
           SELECT t.*, pr.visibility AS project_visibility, pr.name AS project_name, owner.name AS owner_name, org.name AS owner_org_name,
             COALESCE((SELECT max(risk_level) FROM conflict_records c WHERE c.task_id = t.id AND c.status = 'open'), 'none') AS risk_level
           FROM tasks t
           LEFT JOIN projects pr ON pr.id = t.project_id
           LEFT JOIN persons owner ON owner.id = t.owner_id
           LEFT JOIN organizations org ON org.id = t.owner_org_id
           WHERE t.deleted_at IS NULL
             AND ($1::timestamptz IS NULL OR t.due_at >= $1)
             AND ($2::timestamptz IS NULL OR t.start_at <= $2)
             AND ($10::uuid IS NULL OR t.project_id = $10)
             AND ($11::uuid IS NULL OR t.owner_id = $11)
             AND ($12::uuid IS NULL OR t.owner_org_id = $12)
             AND ($13::text IS NULL OR t.status = $13)
             AND (NOT $14::bool OR EXISTS (SELECT 1 FROM conflict_records cr WHERE cr.task_id = t.id AND cr.status = 'open'))
             AND ($3::bool OR t.visibility = 'normal' OR t.owner_id = $4 OR t.initiator_id = $4 OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4))
             AND (
               $5::bool
               OR t.initiator_id = $4 OR t.owner_id = $4 OR t.acceptor_id = $4
               OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4)
               OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $4 OR $4 = ANY(ta.collaborator_ids)))
               OR (($6::bool OR t.owner_org_id = ANY($8)) AND ($7::bool OR t.project_id IS NULL OR t.project_id = ANY($9)))
             )
         )
         SELECT jsonb_build_object(
           'id', id,
           'type', 'task',
           'title', CASE WHEN project_visibility = 'hidden' AND NOT $3::bool THEN '[隐藏任务]' ELSE name END,
           'summary', summary,
           'task_no', task_no,
           'start', start_at,
           'end', due_at,
           'progress', progress::float8,
           'status', status,
           'priority', priority,
           'risk_level', risk_level,
           'target_url', '/tasks/' || id::text,
           'readonly', status = 'archived',
           'owner_id', owner_id,
           'owner_name', owner_name,
           'owner_org_id', owner_org_id,
           'owner_org_name', owner_org_name,
           'project_id', project_id,
           'project_name', project_name
         ) AS item
         FROM visible_tasks
         ORDER BY start_at NULLS LAST LIMIT 500",
    )
    .bind(start)
    .bind(end)
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
    .bind(project_id)
    .bind(owner_id)
    .bind(org_id)
    .bind(status)
    .bind(risk_only)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({
            "data_scope_applied": true,
            "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?
        }),
    ))
}

async fn gantt_summary(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let scope = data_scope_context(&state.db, &user).await?;
    let start = query
        .get("start")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let end = query
        .get("end")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let project_id = query
        .get("project_id")
        .filter(|v| !v.is_empty())
        .and_then(|v| Uuid::parse_str(v).ok());
    let owner_id = query
        .get("owner_id")
        .filter(|v| !v.is_empty())
        .and_then(|v| Uuid::parse_str(v).ok());
    let org_id = query
        .get("org_id")
        .filter(|v| !v.is_empty())
        .and_then(|v| Uuid::parse_str(v).ok());
    let status = query.get("status").filter(|v| !v.is_empty()).cloned();
    let risk_only = query.get("risk_only").map(|v| v == "1" || v == "true").unwrap_or(false);
    let row = sqlx::query(
        "SELECT
          count(*) FILTER (WHERE t.status = 'in_progress') AS in_progress,
          count(*) FILTER (WHERE t.status IN ('acceptance_pending', 'pending_acceptance')) AS acceptance_pending,
          count(*) FILTER (WHERE t.status = 'archived') AS archived,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conflict_records cr WHERE cr.task_id = t.id AND cr.status = 'open')) AS open_risk
         FROM tasks t
         LEFT JOIN projects pr ON pr.id = t.project_id
         WHERE t.deleted_at IS NULL
           AND ($1::timestamptz IS NULL OR t.due_at >= $1)
           AND ($2::timestamptz IS NULL OR t.start_at <= $2)
           AND ($10::uuid IS NULL OR t.project_id = $10)
           AND ($11::uuid IS NULL OR t.owner_id = $11)
           AND ($12::uuid IS NULL OR t.owner_org_id = $12)
           AND ($13::text IS NULL OR t.status = $13)
           AND (NOT $14::bool OR EXISTS (SELECT 1 FROM conflict_records cr WHERE cr.task_id = t.id AND cr.status = 'open'))
           AND ($3::bool OR t.visibility = 'normal' OR t.owner_id = $4 OR t.initiator_id = $4 OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4))
           AND (
             $5::bool
             OR t.initiator_id = $4 OR t.owner_id = $4 OR t.acceptor_id = $4
             OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4)
             OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $4 OR $4 = ANY(ta.collaborator_ids)))
             OR (($6::bool OR t.owner_org_id = ANY($8)) AND ($7::bool OR t.project_id IS NULL OR t.project_id = ANY($9)))
           )",
    )
    .bind(start)
    .bind(end)
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
    .bind(project_id)
    .bind(owner_id)
    .bind(org_id)
    .bind(status)
    .bind(risk_only)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "data_scope_applied": true,
        "in_progress": row.get::<i64, _>("in_progress"),
        "acceptance_pending": row.get::<i64, _>("acceptance_pending"),
        "archived": row.get::<i64, _>("archived"),
        "open_risk": row.get::<i64, _>("open_risk")
    })))
}

async fn search(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let scope = data_scope_context(&state.db, &user).await?;
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
            AND (
              $6::bool
              OR t.initiator_id = $3 OR t.owner_id = $3 OR t.acceptor_id = $3
              OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $3)
              OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $3 OR $3 = ANY(ta.collaborator_ids)))
              OR (($7::bool OR t.owner_org_id = ANY($9)) AND ($8::bool OR t.project_id IS NULL OR t.project_id = ANY($10)))
            )

          UNION ALL

          SELECT
            'project'::text,
            p.id,
            p.name,
            concat_ws(' ', p.project_no, p.name, p.summary, p.status, p.project_type),
            p.status,
            p.updated_at,
            '/projects/' || p.id::text
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
            AND (
              $6::bool
              OR p.leader_id = $3 OR p.managed_by_id = $3
              OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $3 AND pm.active)
              OR (($7::bool OR p.owner_org_id = ANY($9)) AND ($8::bool OR p.id = ANY($10)))
            )

          UNION ALL

          SELECT
            'person'::text,
            p.id,
            p.name,
            concat_ws(' ', p.employee_no, p.name, p.work_status, a.login_name),
            p.work_status,
            p.updated_at,
            '/people/' || p.id::text
          FROM persons p
          LEFT JOIN accounts a ON a.person_id = p.id
          WHERE p.deleted_at IS NULL
            AND ($5::bool OR p.id = $3)
            AND (
              $6::bool OR p.id = $3 OR $7::bool OR p.primary_org_id = ANY($9)
              OR EXISTS (SELECT 1 FROM person_org_memberships pom WHERE pom.person_id = p.id AND pom.active AND pom.org_id = ANY($9))
            )
            AND ($1 = '' OR concat_ws(' ', p.employee_no, p.name, p.work_status, a.login_name) ILIKE '%' || $1 || '%')

          UNION ALL

          SELECT
            'resource'::text,
            r.id,
            r.name,
            concat_ws(' ', r.name, r.resource_type, r.status),
            r.status,
            r.updated_at,
            '/resources/' || r.id::text
          FROM resource_files r
          WHERE ($2::bool OR r.visibility = 'normal' OR r.uploader_id = $3)
            AND (
              $6::bool OR r.uploader_id = $3
              OR EXISTS (
                SELECT 1 FROM resource_links rl
                JOIN projects p ON p.id = rl.object_id
                WHERE rl.resource_id = r.id AND rl.object_type = 'project' AND p.deleted_at IS NULL
                  AND (
                    p.leader_id = $3 OR p.managed_by_id = $3
                    OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $3 AND pm.active)
                    OR (($7::bool OR p.owner_org_id = ANY($9)) AND ($8::bool OR p.id = ANY($10)))
                  )
              )
              OR EXISTS (
                SELECT 1 FROM resource_links rl
                JOIN tasks t ON t.id = rl.object_id
                WHERE rl.resource_id = r.id AND rl.object_type = 'task' AND t.deleted_at IS NULL
                  AND (
                    t.initiator_id = $3 OR t.owner_id = $3 OR t.acceptor_id = $3
                    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $3)
                    OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $3 OR $3 = ANY(ta.collaborator_ids)))
                    OR (($7::bool OR t.owner_org_id = ANY($9)) AND ($8::bool OR t.project_id IS NULL OR t.project_id = ANY($10)))
                  )
              )
            )
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
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
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
