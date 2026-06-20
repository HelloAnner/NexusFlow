async fn build_report_payload(
    db: &PgPool,
    user: &CurrentUser,
    report_type: &str,
    period_start: Option<NaiveDate>,
    period_end: Option<NaiveDate>,
) -> Result<Value, ApiError> {
    match report_type {
        "task_overview" => task_overview_report(db, user, period_start, period_end).await,
        "person_workload" => person_workload_report(db, user, period_start, period_end).await,
        "resource_archive" => resource_archive_report(db, user, period_start, period_end).await,
        _ => Err(ApiError::bad_request("unsupported report type")),
    }
}

async fn task_overview_report(
    db: &PgPool,
    user: &CurrentUser,
    period_start: Option<NaiveDate>,
    period_end: Option<NaiveDate>,
) -> Result<Value, ApiError> {
    let scope = data_scope_context(db, user).await?;
    let row = sqlx::query(
        "WITH visible_tasks AS (
           SELECT t.id, t.status, t.due_at
           FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
           WHERE t.deleted_at IS NULL
             AND ($8::date IS NULL OR t.created_at::date >= $8)
             AND ($9::date IS NULL OR t.created_at::date <= $9)
             AND (
               t.visibility = 'normal' OR t.initiator_id = $1 OR t.owner_id = $1 OR t.acceptor_id = $1
               OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $1)
               OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $1 OR $1 = ANY(ta.collaborator_ids)))
               OR p.visibility = 'normal' OR p.leader_id = $1
               OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $1 AND pm.active)
               OR EXISTS (SELECT 1 FROM visibility_grants vg WHERE vg.object_type IN ('task','project') AND vg.object_id IN (t.id, t.project_id)
                 AND ((vg.subject_type = 'person' AND vg.subject_id = $1) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($2)))
                 AND (vg.expires_at IS NULL OR vg.expires_at > now()))
             )
             AND (
               $3::bool OR t.initiator_id = $1 OR t.owner_id = $1 OR t.acceptor_id = $1
               OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $1)
               OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $1 OR $1 = ANY(ta.collaborator_ids)))
               OR (($4::bool OR t.owner_org_id = ANY($6)) AND ($5::bool OR t.project_id IS NULL OR t.project_id = ANY($7)))
             )
         )
         SELECT count(*) AS total_count,
           count(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
           count(*) FILTER (WHERE status IN ('pending_review','pending_acceptance','pending_approval')) AS pending_count,
           count(*) FILTER (WHERE status IN ('completed','archived')) AS completed_count,
           count(*) FILTER (WHERE due_at < now() AND status NOT IN ('completed','archived','cancelled')) AS overdue_count,
           (SELECT count(*) FROM conflict_records cr JOIN visible_tasks vt ON vt.id = cr.task_id WHERE cr.status = 'open') AS open_conflict_count
         FROM visible_tasks",
    )
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
    .bind(period_start)
    .bind(period_end)
    .fetch_one(db)
    .await?;
    Ok(report_json("task_overview", period_start, period_end, &row))
}

async fn person_workload_report(
    db: &PgPool,
    user: &CurrentUser,
    period_start: Option<NaiveDate>,
    period_end: Option<NaiveDate>,
) -> Result<Value, ApiError> {
    let scope = data_scope_context(db, user).await?;
    let row = sqlx::query(
        "WITH visible_people AS (
           SELECT p.id FROM persons p
           WHERE p.deleted_at IS NULL AND (
             $2::bool OR p.id = $1 OR $3::bool OR p.primary_org_id = ANY($4)
             OR EXISTS (SELECT 1 FROM person_org_memberships pom WHERE pom.person_id = p.id AND pom.active AND pom.org_id = ANY($4))
           )
         )
         SELECT (SELECT count(*) FROM visible_people) AS visible_person_count,
           count(DISTINCT ws.person_id) AS workload_person_count,
           count(*) AS workload_day_count,
           COALESCE(sum(ws.committed_hours), 0)::float8 AS committed_hours,
           COALESCE(avg(ws.load_rate), 0)::float8 AS average_load_rate,
           count(*) FILTER (WHERE ws.load_rate > 1) AS overload_day_count,
           count(*) FILTER (WHERE ws.full_day_occupied) AS full_day_count
         FROM workload_snapshots ws JOIN visible_people vp ON vp.id = ws.person_id
         WHERE ($5::date IS NULL OR ws.work_date >= $5)
           AND ($6::date IS NULL OR ws.work_date <= $6)",
    )
    .bind(user.person_id)
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(&scope.org_ids)
    .bind(period_start)
    .bind(period_end)
    .fetch_one(db)
    .await?;
    Ok(report_json("person_workload", period_start, period_end, &row))
}

async fn resource_archive_report(
    db: &PgPool,
    user: &CurrentUser,
    period_start: Option<NaiveDate>,
    period_end: Option<NaiveDate>,
) -> Result<Value, ApiError> {
    let scope = data_scope_context(db, user).await?;
    let row = sqlx::query(
        "SELECT count(DISTINCT rf.id) AS total_count,
           count(DISTINCT rf.id) FILTER (WHERE rf.status = 'archived') AS archived_count,
           count(DISTINCT rf.id) FILTER (WHERE rf.is_final_result) AS final_result_count,
           count(DISTINCT rf.id) FILTER (WHERE rf.is_stage_result) AS stage_result_count,
           count(DISTINCT rv.id) AS version_count,
           count(DISTINCT rl.resource_id::text || ':' || rl.object_type || ':' || rl.object_id::text) AS link_count
         FROM resource_files rf
         LEFT JOIN resource_versions rv ON rv.resource_id = rf.id
         LEFT JOIN resource_links rl ON rl.resource_id = rf.id
         WHERE rf.deleted_at IS NULL
           AND ($8::date IS NULL OR rf.created_at::date >= $8)
           AND ($9::date IS NULL OR rf.created_at::date <= $9)
           AND (
             $3::bool OR rf.uploader_id = $1 OR rf.visibility = 'public'
             OR EXISTS (SELECT 1 FROM visibility_grants vg WHERE vg.object_type = 'resource' AND vg.object_id = rf.id
               AND ((vg.subject_type = 'person' AND vg.subject_id = $1) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($2)))
               AND (vg.expires_at IS NULL OR vg.expires_at > now()))
             OR EXISTS (SELECT 1 FROM resource_links prl JOIN projects p ON p.id = prl.object_id
               WHERE prl.resource_id = rf.id AND prl.object_type = 'project' AND p.deleted_at IS NULL
                 AND (p.leader_id = $1 OR p.managed_by_id = $1
                   OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $1 AND pm.active)
                   OR (($4::bool OR p.owner_org_id = ANY($6)) AND ($5::bool OR p.id = ANY($7)))))
             OR EXISTS (SELECT 1 FROM resource_links trl JOIN tasks t ON t.id = trl.object_id
               WHERE trl.resource_id = rf.id AND trl.object_type = 'task' AND t.deleted_at IS NULL
                 AND (t.initiator_id = $1 OR t.owner_id = $1 OR t.acceptor_id = $1
                   OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $1)
                   OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $1 OR $1 = ANY(ta.collaborator_ids)))
                   OR (($4::bool OR t.owner_org_id = ANY($6)) AND ($5::bool OR t.project_id IS NULL OR t.project_id = ANY($7)))))
           )",
    )
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
    .bind(period_start)
    .bind(period_end)
    .fetch_one(db)
    .await?;
    Ok(report_json("resource_archive", period_start, period_end, &row))
}

fn report_json(
    report_type: &str,
    period_start: Option<NaiveDate>,
    period_end: Option<NaiveDate>,
    row: &sqlx::postgres::PgRow,
) -> Value {
    let mut payload = json!({
        "report_type": report_type,
        "period_start": period_start,
        "period_end": period_end,
        "data_scope_applied": true,
        "generated_from": "server_aggregate"
    });
    for column in row.columns() {
        let name = column.name();
        if let Ok(value) = row.try_get::<i64, _>(name) {
            payload[name] = json!(value);
        } else if let Ok(value) = row.try_get::<f64, _>(name) {
            payload[name] = json!(value);
        }
    }
    payload
}
