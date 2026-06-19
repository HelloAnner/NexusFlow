async fn task_detail_workbench(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
) -> Result<Value, ApiError> {
    ensure_task_visible(db, user, id).await?;
    let task = get_json_by_id(db, "tasks", id).await?;
    let members = sqlx::query(
        "SELECT (
           to_jsonb(tm.*)
           || jsonb_build_object(
             'person_name', p.name,
             'primary_org_name', o.name
           )
         ) AS item
         FROM task_members tm
         LEFT JOIN persons p ON p.id = tm.person_id
         LEFT JOIN organizations o ON o.id = p.primary_org_id
         WHERE tm.task_id = $1
         ORDER BY tm.member_role, p.name",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let assignments = sqlx::query(
        "SELECT (
           to_jsonb(ta.*)
           || jsonb_build_object(
             'owner_name', owner.name,
             'acceptor_name', acceptor.name
           )
         ) AS item
         FROM task_assignments ta
         LEFT JOIN persons owner ON owner.id = ta.owner_id
         LEFT JOIN persons acceptor ON acceptor.id = ta.acceptor_id
         WHERE ta.task_id = $1
         ORDER BY ta.created_at",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let progress_reports = sqlx::query(
        "SELECT jsonb_build_object(
           'id', tpr.id,
           'assignment_id', tpr.assignment_id,
           'assignment_title', ta.title,
           'reporter_id', tpr.reporter_id,
           'reporter_name', reporter.name,
           'spent_hours', tpr.spent_hours::float8,
           'progress', tpr.progress::float8,
           'content', tpr.content,
           'result_resource_ids', tpr.result_resource_ids,
           'status', tpr.status,
           'reported_at', tpr.reported_at,
           'payload', tpr.payload
         ) AS item
         FROM task_progress_reports tpr
         JOIN task_assignments ta ON ta.id = tpr.assignment_id
         LEFT JOIN persons reporter ON reporter.id = tpr.reporter_id
         WHERE ta.task_id = $1
         ORDER BY tpr.reported_at DESC
         LIMIT 100",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let resources = sqlx::query(
        "SELECT jsonb_build_object(
           'id', rf.id,
           'name', rf.name,
           'resource_type', rf.resource_type,
           'uploader_id', rf.uploader_id,
           'uploader_name', uploader.name,
           'visibility', rf.visibility,
           'status', rf.status,
           'current_version_id', rf.current_version_id,
           'is_stage_result', rf.is_stage_result,
           'is_final_result', rf.is_final_result,
           'object_key', rv.object_key,
           'file_size', rv.file_size,
           'content_type', rv.content_type,
           'version_no', rv.version_no,
           'payload', rf.payload,
           'created_at', rf.created_at,
           'updated_at', rf.updated_at
         ) AS item
         FROM resource_links rl
         JOIN resource_files rf ON rf.id = rl.resource_id AND rf.deleted_at IS NULL
         LEFT JOIN resource_versions rv ON rv.id = rf.current_version_id
         LEFT JOIN persons uploader ON uploader.id = rf.uploader_id
         WHERE rl.object_type = 'task' AND rl.object_id = $1
         ORDER BY rf.updated_at DESC
         LIMIT 100",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let requirement_result = evaluate_resource_requirements(db, "task", id).await?;
    let approvals = sqlx::query(
        "SELECT to_jsonb(approval_tickets.*) AS item
         FROM approval_tickets
         WHERE task_id = $1
         ORDER BY created_at DESC",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let acceptances = sqlx::query(
        "SELECT (
           to_jsonb(ta.*)
           || jsonb_build_object(
             'submitter_name', submitter.name,
             'acceptor_name', acceptor.name
           )
         ) AS item
         FROM task_acceptances ta
         LEFT JOIN persons submitter ON submitter.id = ta.submitter_id
         LEFT JOIN persons acceptor ON acceptor.id = ta.acceptor_id
         WHERE ta.task_id = $1
         ORDER BY ta.submitted_at DESC",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let change_logs = sqlx::query(
        "SELECT (
           to_jsonb(tcl.*)
           || jsonb_build_object('changed_by_name', actor.name)
         ) AS item
         FROM task_change_logs tcl
         LEFT JOIN persons actor ON actor.id = tcl.changed_by
         WHERE tcl.task_id = $1
         ORDER BY tcl.created_at DESC
         LIMIT 100",
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
         WHERE (de.object_type = 'task' AND de.object_id = $1)
            OR (de.object_type = 'resource_file' AND de.object_id IN (
              SELECT resource_id FROM resource_links WHERE object_type = 'task' AND object_id = $1
            ))
            OR (de.object_type = 'assignment' AND de.object_id IN (
              SELECT id FROM task_assignments WHERE task_id = $1
            ))
         ORDER BY de.created_at DESC
         LIMIT 100",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    Ok(json!({
        "task": task,
        "members": rows_to_json(members)?,
        "assignments": rows_to_json(assignments)?,
        "progress_reports": rows_to_json(progress_reports)?,
        "resources": rows_to_json(resources)?,
        "resource_requirements": requirement_result.get("items").cloned().unwrap_or_else(|| json!([])),
        "resource_requirement_summary": requirement_result.get("summary").cloned().unwrap_or_else(|| json!({})),
        "approvals": rows_to_json(approvals)?,
        "acceptances": rows_to_json(acceptances)?,
        "change_logs": rows_to_json(change_logs)?,
        "events": rows_to_json(events)?,
        "available_actions": task_available_actions(&task, user)
    }))
}
