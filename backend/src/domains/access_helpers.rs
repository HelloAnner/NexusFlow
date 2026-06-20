async fn ensure_project_visible(
    db: &PgPool,
    user: &CurrentUser,
    project_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL)",
        )
        .bind(project_id)
        .fetch_one(db)
        .await?;
        return if exists {
            Ok(())
        } else {
            Err(ApiError::not_found("project not found"))
        };
    }
    let scope = data_scope_context(db, user).await?;
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = $1 AND p.deleted_at IS NULL
            AND (
              p.visibility = 'normal' OR p.leader_id = $2 OR EXISTS (
                SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $2 AND pm.active
              ) OR EXISTS (
                SELECT 1 FROM visibility_grants vg WHERE vg.object_type = 'project' AND vg.object_id = p.id
                  AND ((vg.subject_type = 'person' AND vg.subject_id = $2) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($3)))
                  AND (vg.expires_at IS NULL OR vg.expires_at > now())
              )
            )
            AND (
              $4::bool
              OR p.leader_id = $2
              OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $2 AND pm.active)
              OR (($5::bool OR p.owner_org_id = ANY($7)) AND ($6::bool OR p.id = ANY($8)))
            )
        )",
    )
    .bind(project_id)
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
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
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1 AND deleted_at IS NULL)",
        )
        .bind(task_id)
        .fetch_one(db)
        .await?;
        return if exists {
            Ok(())
        } else {
            Err(ApiError::not_found("task not found"))
        };
    }
    let scope = data_scope_context(db, user).await?;
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM tasks t
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.id = $1 AND t.deleted_at IS NULL
            AND (
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
            AND (
              $4::bool
              OR t.initiator_id = $2 OR t.owner_id = $2 OR t.acceptor_id = $2
              OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $2)
              OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $2 OR $2 = ANY(ta.collaborator_ids)))
              OR (($5::bool OR t.owner_org_id = ANY($7)) AND ($6::bool OR t.project_id IS NULL OR t.project_id = ANY($8)))
            )
        )",
    )
    .bind(task_id)
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(scope.unrestricted)
    .bind(scope.all_orgs)
    .bind(scope.all_projects)
    .bind(&scope.org_ids)
    .bind(&scope.project_ids)
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
