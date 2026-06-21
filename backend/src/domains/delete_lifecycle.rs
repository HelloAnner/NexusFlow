async fn org_delete_blockers(db: &PgPool, id: Uuid) -> Result<Value, ApiError> {
    let row = sqlx::query(
        "SELECT
          (SELECT count(*) FROM organizations WHERE parent_id = $1 AND deleted_at IS NULL) AS child_count,
          (SELECT count(*) FROM persons p WHERE p.deleted_at IS NULL AND (
             p.primary_org_id = $1 OR EXISTS (
               SELECT 1 FROM person_org_memberships pom
               WHERE pom.person_id = p.id AND pom.org_id = $1 AND pom.active
             )
          )) AS person_count,
          (SELECT count(*) FROM projects WHERE owner_org_id = $1 AND deleted_at IS NULL) AS project_count,
          (SELECT count(*) FROM tasks WHERE owner_org_id = $1 AND deleted_at IS NULL) AS task_count",
    )
    .bind(id)
    .fetch_one(db)
    .await?;
    Ok(json!({
        "child_count": row.get::<i64, _>("child_count"),
        "person_count": row.get::<i64, _>("person_count"),
        "project_count": row.get::<i64, _>("project_count"),
        "task_count": row.get::<i64, _>("task_count")
    }))
}

async fn check_org_deletable(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("org.manage")?;
    let before = get_json_by_id(&state.db, "organizations", id).await?;
    if before.get("deleted_at").is_some_and(|v| !v.is_null()) {
        return Err(ApiError::not_found("organization not found"));
    }
    let blockers = org_delete_blockers(&state.db, id).await?;
    Ok(Json(json!({ "deletable": !has_active_blockers(&blockers), "blockers": blockers })))
}

fn has_active_blockers(blockers: &Value) -> bool {
    blockers
        .as_object()
        .is_some_and(|items| items.values().any(|value| value.as_i64().unwrap_or(0) > 0))
}

async fn delete_org(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("org.manage")?;
    let before = get_json_by_id(&state.db, "organizations", id).await?;
    if before.get("deleted_at").is_some_and(|v| !v.is_null()) {
        return Err(ApiError::not_found("organization not found"));
    }
    let blockers = org_delete_blockers(&state.db, id).await?;
    if has_active_blockers(&blockers) {
        let child_count = blockers["child_count"].as_i64().unwrap_or(0);
        let person_count = blockers["person_count"].as_i64().unwrap_or(0);
        let project_count = blockers["project_count"].as_i64().unwrap_or(0);
        let task_count = blockers["task_count"].as_i64().unwrap_or(0);
        let mut parts: Vec<String> = Vec::new();
        if child_count > 0 {
            parts.push(format!("{child_count} 个子部门"));
        }
        if person_count > 0 {
            parts.push(format!("{person_count} 名人员"));
        }
        if project_count > 0 {
            parts.push(format!("{project_count} 个项目"));
        }
        if task_count > 0 {
            parts.push(format!("{task_count} 个任务"));
        }
        let detail = if parts.is_empty() {
            "存在关联数据".to_string()
        } else {
            parts.join("、")
        };
        return Err(ApiError::conflict_with_details(
            format!("该组织存在关联数据，无法删除：{detail}。"),
            blockers,
        ));
    }
    sqlx::query(
        "UPDATE organizations
         SET deleted_at = now(), enabled = false, updated_at = now(), version = version + 1
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "organization",
        Some(id),
        "organization.deleted",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "organization.deleted",
        "organization",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "deleted": true })))
}

async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    if Some(id) == user.person_id {
        return Err(ApiError::conflict("current user cannot delete self"));
    }
    let before = get_json_by_id(&state.db, "persons", id).await?;
    if before.get("deleted_at").is_some_and(|v| !v.is_null()) {
        return Err(ApiError::not_found("person not found"));
    }
    let row = sqlx::query(
        "SELECT
          (SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND (initiator_id = $1 OR owner_id = $1 OR acceptor_id = $1)) AS task_count,
          (SELECT count(*) FROM task_assignments WHERE owner_id = $1 AND status NOT IN ('confirmed','cancelled','archived')) AS assignment_count,
          (SELECT count(*) FROM project_members WHERE person_id = $1 AND active) AS project_member_count,
          (SELECT count(*) FROM workload_snapshots WHERE person_id = $1 AND work_date >= current_date) AS future_workload_count",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    let blockers = json!({
        "task_count": row.get::<i64, _>("task_count"),
        "assignment_count": row.get::<i64, _>("assignment_count"),
        "project_member_count": row.get::<i64, _>("project_member_count"),
        "future_workload_count": row.get::<i64, _>("future_workload_count")
    });
    if blockers
        .as_object()
        .is_some_and(|items| items.values().any(|value| value.as_i64().unwrap_or(0) > 0))
    {
        return Err(ApiError::conflict(format!(
            "person cannot be deleted while it has active references: {blockers}"
        )));
    }
    sqlx::query(
        "UPDATE persons
         SET deleted_at = now(), work_status = 'deleted', dispatch_enabled = false,
             account_status = 'disabled', updated_at = now(), version = version + 1
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE accounts SET status = 'disabled', deleted_at = now(), updated_at = now() WHERE person_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    sqlx::query(
        "UPDATE person_org_memberships SET active = false, left_at = now()
         WHERE person_id = $1 AND active",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "person",
        Some(id),
        "person.deleted",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "person.deleted",
        "person",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "deleted": true })))
}

async fn delete_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_task_deletable(&state.db, &user, id).await?;
    let before = get_json_by_id(&state.db, "tasks", id).await?;
    let status = before.get("status").and_then(Value::as_str).unwrap_or("");
    if status == "archived" {
        return Err(ApiError::conflict("archived task cannot be deleted"));
    }
    sqlx::query(
        "UPDATE tasks
         SET deleted_at = now(), status = 'deleted', updated_at = now(), updated_by = $2, version = version + 1
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user.person_id)
    .execute(&state.db)
    .await?;
    sqlx::query("DELETE FROM search_index_meta WHERE object_type = 'task' AND object_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO task_change_logs(task_id, changed_by, change_type, reason, before_payload, after_payload) VALUES ($1,$2,'task.deleted',$3,$4,$5)")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "reason", ""))
        .bind(before.clone())
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    audit(
        &state.db,
        user.person_id,
        "task",
        Some(id),
        "task.deleted",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "task.deleted",
        "task",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "deleted": true })))
}

async fn ensure_task_deletable(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() || user.actions.contains("task.dispatch") {
        return Ok(());
    }
    let deletable = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
          SELECT 1 FROM tasks
          WHERE id = $1 AND deleted_at IS NULL
            AND status IN ('draft','cancelled')
            AND (initiator_id = $2 OR owner_id = $2)
        )",
    )
    .bind(id)
    .bind(user.person_id)
    .fetch_one(db)
    .await?;
    if deletable {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "task can only be deleted by dispatcher or draft/cancelled owner",
        ))
    }
}
