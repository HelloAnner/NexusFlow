async fn project_detail_workbench(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
) -> Result<Value, ApiError> {
    ensure_project_visible(db, user, id).await?;
    let project = get_json_by_id(db, "projects", id).await?;
    let members = sqlx::query(
        "SELECT jsonb_build_object(
           'project_id', pm.project_id,
           'person_id', pm.person_id,
           'person_name', p.name,
           'primary_org_name', o.name,
           'project_role', pm.project_role,
           'work_desc', pm.work_desc,
           'joined_at', pm.joined_at,
           'left_at', pm.left_at,
           'active', pm.active
         ) AS item
         FROM project_members pm
         LEFT JOIN persons p ON p.id = pm.person_id
         LEFT JOIN organizations o ON o.id = p.primary_org_id
         WHERE pm.project_id = $1
         ORDER BY pm.active DESC, pm.joined_at DESC",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let tasks = sqlx::query(
        "SELECT (
          to_jsonb(t.*)
          || jsonb_build_object('payload', t.payload || jsonb_build_object('owner_name', owner.name, 'owner_org_name', org.name))
        ) AS item
         FROM tasks t
         LEFT JOIN persons owner ON owner.id = t.owner_id
         LEFT JOIN organizations org ON org.id = t.owner_org_id
         WHERE t.deleted_at IS NULL AND t.project_id = $1
         ORDER BY t.due_at NULLS LAST, t.created_at DESC
         LIMIT 200",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let resources = sqlx::query(
        "SELECT item
         FROM (
           SELECT DISTINCT ON (rf.id)
             jsonb_build_object(
               'id', rf.id,
               'name', rf.name,
               'resource_type', rf.resource_type,
               'status', rf.status,
               'version_no', rv.version_no,
               'file_size', rv.file_size,
               'content_type', rv.content_type,
               'is_stage_result', rf.is_stage_result,
               'is_final_result', rf.is_final_result,
               'created_at', rf.created_at,
               'updated_at', rf.updated_at
             ) AS item,
             rf.updated_at
           FROM resource_files rf
           LEFT JOIN resource_versions rv ON rv.id = rf.current_version_id
           JOIN resource_links rl ON rl.resource_id = rf.id
           LEFT JOIN tasks t ON rl.object_type = 'task' AND rl.object_id = t.id
           WHERE rf.deleted_at IS NULL
             AND ((rl.object_type = 'project' AND rl.object_id = $1) OR t.project_id = $1)
           ORDER BY rf.id, rf.updated_at DESC
         ) scoped_resources
         ORDER BY updated_at DESC
         LIMIT 200",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let grants = if can_manage_project(db, user, id).await? {
        sqlx::query("SELECT to_jsonb(visibility_grants.*) AS item FROM visibility_grants WHERE object_type = 'project' AND object_id = $1 ORDER BY created_at DESC")
            .bind(id)
            .fetch_all(db)
            .await?
    } else {
        Vec::new()
    };
    let events = sqlx::query(
        "SELECT to_jsonb(domain_events.*) AS item
         FROM domain_events
         WHERE object_type = 'project' AND object_id = $1
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let stats = project_stats_value(db, id).await?;
    Ok(json!({
        "project": project,
        "members": rows_to_json(members)?,
        "tasks": rows_to_json(tasks)?,
        "resources": rows_to_json(resources)?,
        "visibility_grants": rows_to_json(grants)?,
        "events": rows_to_json(events)?,
        "stats": stats
    }))
}

async fn person_detail_workbench(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
) -> Result<Value, ApiError> {
    ensure_person_visible(db, user, id).await?;
    let person = get_json_by_id(db, "persons", id).await?;
    let projects = sqlx::query(
        "SELECT jsonb_build_object(
           'project_id', p.id,
           'project_name', p.name,
           'project_no', p.project_no,
           'project_status', p.status,
           'project_visibility', p.visibility,
           'owner_org_name', o.name,
           'project_role', pm.project_role,
           'work_desc', pm.work_desc,
           'joined_at', pm.joined_at,
           'left_at', pm.left_at,
           'active', pm.active
         ) AS item
         FROM project_members pm
         JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL
         LEFT JOIN organizations o ON o.id = p.owner_org_id
         WHERE pm.person_id = $1
         ORDER BY pm.active DESC, pm.joined_at DESC",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let skills = sqlx::query(
        "SELECT jsonb_build_object(
           'id', st.id,
           'name', st.name,
           'enabled', st.enabled,
           'payload', st.payload
         ) AS item
         FROM person_skill_tags pst
         JOIN skill_tags st ON st.id = pst.skill_id
         WHERE pst.person_id = $1 AND st.enabled
         ORDER BY st.name",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let tasks = sqlx::query(
        "SELECT item
         FROM (
           SELECT DISTINCT ON (t.id)
             (
               to_jsonb(t.*)
               || jsonb_build_object('payload', t.payload || jsonb_build_object('project_name', pr.name, 'owner_org_name', org.name))
             ) AS item,
             t.due_at,
             t.created_at
           FROM tasks t
           LEFT JOIN projects pr ON pr.id = t.project_id
           LEFT JOIN organizations org ON org.id = t.owner_org_id
           LEFT JOIN task_members tm ON tm.task_id = t.id AND tm.person_id = $1
           LEFT JOIN task_assignments ta ON ta.task_id = t.id AND (ta.owner_id = $1 OR $1 = ANY(ta.collaborator_ids))
           WHERE t.deleted_at IS NULL
             AND (t.owner_id = $1 OR t.initiator_id = $1 OR t.acceptor_id = $1 OR tm.person_id IS NOT NULL OR ta.id IS NOT NULL)
           ORDER BY t.id, t.due_at NULLS LAST, t.created_at DESC
         ) scoped_tasks
         ORDER BY due_at NULLS LAST, created_at DESC
         LIMIT 200",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let workload = sqlx::query(
        "SELECT jsonb_build_object(
           'date', work_date,
           'committed_hours', committed_hours::float8,
           'standard_hours', standard_hours::float8,
           'load_rate', load_rate::float8,
           'full_day_occupied', full_day_occupied,
           'source_task_ids', source_task_ids,
           'source_assignment_ids', source_assignment_ids,
           'source_tasks', COALESCE(source_tasks.items, '[]'::jsonb)
         ) AS item
         FROM workload_snapshots ws
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'id', t.id,
             'task_no', t.task_no,
             'name', t.name,
             'status', t.status,
             'due_at', t.due_at,
             'progress', t.progress::float8
           ) ORDER BY t.due_at NULLS LAST, t.created_at DESC) AS items
           FROM tasks t
           WHERE t.id = ANY(ws.source_task_ids) AND t.deleted_at IS NULL
         ) source_tasks ON true
         WHERE ws.person_id = $1 AND ws.work_date BETWEEN current_date - interval '7 days' AND current_date + interval '21 days'
         ORDER BY work_date",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let events = sqlx::query(
        "SELECT (
           to_jsonb(de.*)
           || jsonb_build_object('actor_name', actor.name)
         ) AS item
         FROM domain_events de
         LEFT JOIN persons actor ON actor.id = de.actor_id
         WHERE (de.object_type = 'person' AND de.object_id = $1) OR de.actor_id = $1
         ORDER BY de.created_at DESC
         LIMIT 50",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    Ok(json!({
        "person": person,
        "skills": rows_to_json(skills)?,
        "projects": rows_to_json(projects)?,
        "tasks": rows_to_json(tasks)?,
        "workload": rows_to_json(workload)?,
        "events": rows_to_json(events)?
    }))
}

async fn resource_detail_workbench(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
) -> Result<Value, ApiError> {
    ensure_resource_visible(db, user, id).await?;
    let resource = get_json_by_id(db, "resource_files", id).await?;
    let versions = sqlx::query(
        "SELECT to_jsonb(resource_versions.*) AS item
         FROM resource_versions
         WHERE resource_id = $1
         ORDER BY version_no DESC",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let links = sqlx::query(
        "SELECT jsonb_build_object(
           'resource_id', rl.resource_id,
           'object_type', rl.object_type,
           'object_id', rl.object_id,
           'object_name', COALESCE(t.name, p.name),
           'object_no', COALESCE(t.task_no, p.project_no),
           'target_url', CASE
             WHEN rl.object_type = 'task' THEN '/tasks/' || rl.object_id::text
             WHEN rl.object_type = 'project' THEN '/projects/' || rl.object_id::text
             ELSE ''
           END
         ) AS item
         FROM resource_links rl
         LEFT JOIN tasks t ON rl.object_type = 'task' AND t.id = rl.object_id
         LEFT JOIN projects p ON rl.object_type = 'project' AND p.id = rl.object_id
         WHERE rl.resource_id = $1
         ORDER BY rl.object_type, COALESCE(t.name, p.name)",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let events = sqlx::query(
        "SELECT to_jsonb(domain_events.*) AS item
         FROM domain_events
         WHERE object_type = 'resource_file' AND object_id = $1
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let audits = if user.is_sa() || user.actions.contains("admin.manage") {
        sqlx::query("SELECT to_jsonb(audit_logs.*) AS item FROM audit_logs WHERE object_type = 'resource_file' AND object_id = $1 ORDER BY created_at DESC LIMIT 50")
            .bind(id)
            .fetch_all(db)
            .await?
    } else {
        Vec::new()
    };
    Ok(json!({
        "resource": resource,
        "versions": rows_to_json(versions)?,
        "links": rows_to_json(links)?,
        "events": rows_to_json(events)?,
        "audits": rows_to_json(audits)?
    }))
}

async fn can_manage_project(
    db: &PgPool,
    user: &CurrentUser,
    project_id: Uuid,
) -> Result<bool, ApiError> {
    if user.is_sa() || user.actions.contains("project.manage") || user.actions.contains("admin.manage") {
        return Ok(true);
    }
    let manageable = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND (leader_id = $2 OR managed_by_id = $2))",
    )
    .bind(project_id)
    .bind(user.person_id)
    .fetch_one(db)
    .await?;
    Ok(manageable)
}

async fn project_stats_value(db: &PgPool, id: Uuid) -> Result<Value, ApiError> {
    let row = sqlx::query(
        "SELECT
          (SELECT count(*) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL) AS task_count,
          (SELECT count(*) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL AND status = 'in_progress') AS in_progress_count,
          (SELECT count(*) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL AND due_at < now() AND status NOT IN ('completed','archived','cancelled')) AS overdue_count,
          (SELECT count(*) FROM conflict_records cr JOIN tasks t ON t.id = cr.task_id WHERE t.project_id = $1 AND cr.status = 'open') AS risk_count,
          (SELECT count(*) FROM project_members WHERE project_id = $1 AND active) AS member_count,
          (SELECT count(*) FROM resource_links WHERE object_type = 'project' AND object_id = $1) AS resource_count",
    )
    .bind(id)
    .fetch_one(db)
    .await?;
    Ok(json!({
        "task_count": row.get::<i64, _>("task_count"),
        "in_progress_count": row.get::<i64, _>("in_progress_count"),
        "overdue_count": row.get::<i64, _>("overdue_count"),
        "risk_count": row.get::<i64, _>("risk_count"),
        "member_count": row.get::<i64, _>("member_count"),
        "resource_count": row.get::<i64, _>("resource_count")
    }))
}

async fn ensure_person_visible(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM persons WHERE id = $1 AND deleted_at IS NULL)",
        )
        .bind(id)
        .fetch_one(db)
        .await?;
        return if exists {
            Ok(())
        } else {
            Err(ApiError::not_found("person not found"))
        };
    }
    let scope = data_scope_context(db, user).await?;
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM persons p
          WHERE p.id = $1 AND p.deleted_at IS NULL
            AND (
              $2::bool OR p.id = $3 OR $4::bool OR p.primary_org_id = ANY($5)
              OR EXISTS (
                SELECT 1 FROM person_org_memberships pom
                WHERE pom.person_id = p.id AND pom.active AND pom.org_id = ANY($5)
              )
            )
        )",
    )
    .bind(id)
    .bind(scope.unrestricted)
    .bind(user.person_id)
    .bind(scope.all_orgs)
    .bind(&scope.org_ids)
    .fetch_one(db)
    .await?;
    if visible {
        Ok(())
    } else {
        Err(ApiError::forbidden("person is out of data scope"))
    }
}

async fn ensure_resource_visible(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM resource_files WHERE id = $1 AND deleted_at IS NULL)",
        )
        .bind(id)
        .fetch_one(db)
        .await?;
        return if exists {
            Ok(())
        } else {
            Err(ApiError::not_found("resource not found"))
        };
    }
    let scope = data_scope_context(db, user).await?;
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM resource_files rf
          WHERE rf.id = $1 AND rf.deleted_at IS NULL
            AND (
              $2::bool OR rf.uploader_id = $3 OR rf.visibility = 'public'
              OR EXISTS (
                SELECT 1 FROM visibility_grants vg
                WHERE vg.object_type = 'resource' AND vg.object_id = rf.id
                  AND ((vg.subject_type = 'person' AND vg.subject_id = $3) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($4)))
                  AND (vg.expires_at IS NULL OR vg.expires_at > now())
              )
              OR EXISTS (
                SELECT 1 FROM resource_links rl
                JOIN projects p ON p.id = rl.object_id
                WHERE rl.resource_id = rf.id AND rl.object_type = 'project' AND p.deleted_at IS NULL
                  AND (
                    p.leader_id = $3 OR p.managed_by_id = $3
                    OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $3 AND pm.active)
                    OR (($5::bool OR p.owner_org_id = ANY($7)) AND ($6::bool OR p.id = ANY($8)))
                  )
              )
              OR EXISTS (
                SELECT 1 FROM resource_links rl
                JOIN tasks t ON t.id = rl.object_id
                WHERE rl.resource_id = rf.id AND rl.object_type = 'task' AND t.deleted_at IS NULL
                  AND (
                    t.initiator_id = $3 OR t.owner_id = $3 OR t.acceptor_id = $3
                    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $3)
                    OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $3 OR $3 = ANY(ta.collaborator_ids)))
                    OR (($5::bool OR t.owner_org_id = ANY($7)) AND ($6::bool OR t.project_id IS NULL OR t.project_id = ANY($8)))
                  )
              )
            )
        )",
    )
    .bind(id)
    .bind(scope.unrestricted)
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
    .fetch_one(db)
    .await?;
    if visible {
        Ok(())
    } else {
        Err(ApiError::forbidden("resource is out of data scope"))
    }
}

fn rows_to_json(rows: Vec<sqlx::postgres::PgRow>) -> Result<Vec<Value>, ApiError> {
    rows.iter()
        .map(|row| json_row(row, "item").map_err(ApiError::from))
        .collect()
}
