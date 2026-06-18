async fn move_org(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("org.manage")?;
    let before = get_json_by_id(&state.db, "organizations", id).await?;
    let parent_id = value_uuid(&payload, "parent_id");
    if parent_id == Some(id) {
        return Err(ApiError::bad_request("organization cannot be moved under itself"));
    }
    if let Some(pid) = parent_id {
        let child_path: Option<String> = sqlx::query_scalar(
            "SELECT path FROM organizations WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?;
        let parent_path: Option<String> = sqlx::query_scalar(
            "SELECT path FROM organizations WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(pid)
        .fetch_optional(&state.db)
        .await?;
        let child_path = child_path.ok_or_else(|| ApiError::not_found("organization not found"))?;
        let parent_path = parent_path.ok_or_else(|| ApiError::bad_request("parent not found"))?;
        if parent_path == child_path || parent_path.starts_with(&format!("{child_path}/")) {
            return Err(ApiError::bad_request("organization cannot be moved under its descendant"));
        }
    }
    sqlx::query(
        "UPDATE organizations
         SET parent_id = $2, updated_at = now(), version = version + 1
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(parent_id)
    .execute(&state.db)
    .await?;
    refresh_org_subtree_path(&state.db, id).await?;
    audit(
        &state.db,
        user.person_id,
        "organization",
        Some(id),
        "organization.moved",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "organization.moved",
        "organization",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn refresh_org_subtree_path(db: &PgPool, root_id: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        "WITH RECURSIVE tree AS (
           SELECT o.id, o.parent_id, o.code,
             CASE
               WHEN p.id IS NULL THEN '/' || o.code
               ELSE p.path || '/' || o.code
             END AS new_path
           FROM organizations o
           LEFT JOIN organizations p ON p.id = o.parent_id
           WHERE o.id = $1 AND o.deleted_at IS NULL
           UNION ALL
           SELECT c.id, c.parent_id, c.code, tree.new_path || '/' || c.code
           FROM organizations c
           JOIN tree ON c.parent_id = tree.id
           WHERE c.deleted_at IS NULL
         )
         UPDATE organizations o
         SET path = tree.new_path, updated_at = now(), version = version + 1
         FROM tree
         WHERE o.id = tree.id",
    )
    .bind(root_id)
    .execute(db)
    .await?;
    Ok(())
}
