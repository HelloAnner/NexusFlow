async fn get_json_by_id(db: &PgPool, table: &str, id: Uuid) -> Result<Value, ApiError> {
    let allowed = [
        "accounts",
        "organizations",
        "persons",
        "skill_tags",
        "roles",
        "data_scope_rules",
        "visibility_grants",
        "projects",
        "tasks",
        "task_assignments",
        "approval_tickets",
        "conflict_records",
        "resource_files",
        "tool_entries",
        "invitation_templates",
        "invitation_links",
        "registration_requests",
        "config_versions",
        "todo_items",
        "notifications",
    ];
    if !allowed.contains(&table) {
        return Err(ApiError::bad_request(
            "table is not readable through generic helper",
        ));
    }
    let sql = format!("SELECT to_jsonb(t) AS item FROM {table} t WHERE id = $1");
    sqlx::query(&sql)
        .bind(id)
        .fetch_optional(db)
        .await?
        .map(|r| json_row(&r, "item"))
        .transpose()?
        .ok_or_else(|| ApiError::not_found(format!("{table} not found")))
}
