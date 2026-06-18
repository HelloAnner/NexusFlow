async fn org_tree(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', id, 'name', name, 'code', code, 'org_type', org_type, 'parent_id', parent_id,
          'path', path, 'leader_ids', leader_ids, 'deputy_leader_ids', deputy_leader_ids,
          'technical_supervisor_ids', technical_supervisor_ids, 'default_approver_ids', default_approver_ids,
          'enabled', enabled, 'payload', payload
        ) AS item
         FROM organizations WHERE deleted_at IS NULL ORDER BY path, name",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn list_orgs(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', id, 'name', name, 'code', code, 'org_type', org_type, 'parent_id', parent_id,
          'path', path, 'leader_ids', leader_ids, 'deputy_leader_ids', deputy_leader_ids,
          'technical_supervisor_ids', technical_supervisor_ids, 'default_approver_ids', default_approver_ids,
          'enabled', enabled, 'payload', payload
        ) AS item,
          count(*) OVER() AS total
         FROM organizations
         WHERE deleted_at IS NULL AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR code ILIKE '%' || $1 || '%')
         ORDER BY path, name LIMIT $2 OFFSET $3",
    )
    .bind(query.q.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
    Ok(Json(json!({
        "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "total": total
    })))
}

async fn create_org(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("org.manage")?;
    let name = value_str(&payload, "name", "");
    let code = value_str(&payload, "code", "");
    if name.is_empty() || code.is_empty() {
        return Err(ApiError::bad_request("name and code are required"));
    }
    let parent_id = value_uuid(&payload, "parent_id");
    let parent_path: Option<String> = if let Some(pid) = parent_id {
        sqlx::query_scalar("SELECT path FROM organizations WHERE id = $1 AND deleted_at IS NULL")
            .bind(pid)
            .fetch_optional(&state.db)
            .await?
    } else {
        None
    };
    let path = format!("{}/{}", parent_path.unwrap_or_default(), code);
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO organizations(name, code, org_type, parent_id, path, leader_ids, deputy_leader_ids, technical_supervisor_ids, default_approver_ids, enabled, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10) RETURNING id",
    )
    .bind(name)
    .bind(code)
    .bind(value_str(&payload, "org_type", "department"))
    .bind(parent_id)
    .bind(path)
    .bind(value_uuid_vec(&payload, "leader_ids"))
    .bind(value_uuid_vec(&payload, "deputy_leader_ids"))
    .bind(value_uuid_vec(&payload, "technical_supervisor_ids"))
    .bind(value_uuid_vec(&payload, "default_approver_ids"))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    emit_event(
        &state.db,
        "organization.created",
        "organization",
        Some(id),
        user.person_id,
        payload.clone(),
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_org(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("org.manage")?;
    let before = get_json_by_id(&state.db, "organizations", id).await?;
    sqlx::query(
        "UPDATE organizations SET
          name = COALESCE($2, name),
          code = COALESCE($3, code),
          org_type = COALESCE($4, org_type),
          leader_ids = COALESCE($5, leader_ids),
          deputy_leader_ids = COALESCE($6, deputy_leader_ids),
          technical_supervisor_ids = COALESCE($7, technical_supervisor_ids),
          default_approver_ids = COALESCE($8, default_approver_ids),
          enabled = COALESCE($9, enabled),
          payload = payload || $10,
          updated_at = now(),
          version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("code").and_then(Value::as_str))
    .bind(payload.get("org_type").and_then(Value::as_str))
    .bind(if payload.get("leader_ids").is_some() {
        Some(value_uuid_vec(&payload, "leader_ids"))
    } else {
        None
    })
    .bind(if payload.get("deputy_leader_ids").is_some() {
        Some(value_uuid_vec(&payload, "deputy_leader_ids"))
    } else {
        None
    })
    .bind(if payload.get("technical_supervisor_ids").is_some() {
        Some(value_uuid_vec(&payload, "technical_supervisor_ids"))
    } else {
        None
    })
    .bind(if payload.get("default_approver_ids").is_some() {
        Some(value_uuid_vec(&payload, "default_approver_ids"))
    } else {
        None
    })
    .bind(payload.get("enabled").and_then(Value::as_bool))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    if payload.get("code").is_some() {
        refresh_org_subtree_path(&state.db, id).await?;
    }
    audit(
        &state.db,
        user.person_id,
        "organization",
        Some(id),
        "organization.updated",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "organization.updated",
        "organization",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn disable_org(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("org.manage")?;
    sqlx::query("UPDATE organizations SET enabled = false, updated_at = now(), version = version + 1 WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "organization.disabled",
        "organization",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "enabled": false })))
}

async fn list_users(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', p.id, 'name', p.name, 'employee_no', p.employee_no, 'account_id', p.account_id,
          'primary_org_id', p.primary_org_id, 'primary_org_name', primary_org.name,
          'org_memberships', COALESCE(memberships.items, '[]'::jsonb),
          'management_level', p.management_level, 'professional_level', p.professional_level,
          'work_status', p.work_status, 'daily_standard_hours', p.daily_standard_hours,
          'dispatch_enabled', p.dispatch_enabled, 'account_status', p.account_status, 'system_role_ids', p.system_role_ids,
          'payload', p.payload
        ) AS item,
          count(*) OVER() AS total
         FROM persons p
         LEFT JOIN organizations primary_org ON primary_org.id = p.primary_org_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object('org_id', pom.org_id, 'org_name', o.name, 'membership_type', pom.membership_type, 'active', pom.active) ORDER BY o.path, o.name) AS items
           FROM person_org_memberships pom
           JOIN organizations o ON o.id = pom.org_id
           WHERE pom.person_id = p.id AND pom.active AND o.deleted_at IS NULL
         ) memberships ON true
         WHERE p.deleted_at IS NULL
           AND ($1::text IS NULL OR concat_ws(' ', p.name, p.employee_no, p.work_status, p.account_status, primary_org.name, p.payload->>'role_name', p.payload->>'email') ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR p.work_status = $2)
           AND ($3::uuid IS NULL OR p.primary_org_id = $3 OR EXISTS (
             SELECT 1 FROM person_org_memberships pom WHERE pom.person_id = p.id AND pom.org_id = $3 AND pom.active
           ))
           AND ($4::uuid IS NULL OR $4 = ANY(p.system_role_ids))
         ORDER BY p.created_at DESC LIMIT $5 OFFSET $6",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
    .bind(query.org_id)
    .bind(query.role_id)
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
    Ok(Json(json!({
        "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "total": total
    })))
}

async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    Ok(Json(get_json_by_id(&state.db, "persons", id).await?))
}

async fn create_user(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    let primary_org_id = value_uuid(&payload, "primary_org_id")
        .ok_or_else(|| ApiError::bad_request("primary_org_id is required"))?;
    let daily = value_f64(&payload, "daily_standard_hours", 8.0);
    if daily <= 0.0 {
        return Err(ApiError::bad_request("daily_standard_hours must be > 0"));
    }
    let account_id = if let Some(login_name) = payload.get("login_name").and_then(Value::as_str) {
        let password = value_str(&payload, "password", "123456");
        Some(sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO accounts(login_name, password_hash, status) VALUES ($1, $2, $3) RETURNING id",
        )
        .bind(login_name)
        .bind(hash_password(&password))
        .bind(value_str(&payload, "account_status", "enabled"))
        .fetch_one(&state.db)
        .await?)
    } else {
        None
    };
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO persons(name, employee_no, account_id, primary_org_id, management_level, professional_level, system_role_ids, work_status, daily_standard_hours, dispatch_enabled, account_status, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
    )
    .bind(value_str(&payload, "name", ""))
    .bind(payload.get("employee_no").and_then(Value::as_str))
    .bind(account_id)
    .bind(primary_org_id)
    .bind(payload.get("management_level").and_then(Value::as_str))
    .bind(payload.get("professional_level").and_then(Value::as_str))
    .bind(value_uuid_vec(&payload, "system_role_ids"))
    .bind(value_str(&payload, "work_status", "active"))
    .bind(daily)
    .bind(value_bool(&payload, "dispatch_enabled", true))
    .bind(value_str(&payload, "account_status", "enabled"))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    if let Some(account_id) = account_id {
        sqlx::query("UPDATE accounts SET person_id = $1 WHERE id = $2")
            .bind(id)
            .bind(account_id)
            .execute(&state.db)
            .await?;
    }
    sqlx::query("INSERT INTO person_org_memberships(person_id, org_id, membership_type) VALUES ($1, $2, 'primary') ON CONFLICT DO NOTHING")
        .bind(id)
        .bind(primary_org_id)
        .execute(&state.db)
        .await?;
    sync_person_org_memberships(&state.db, id, &payload).await?;
    emit_event(
        &state.db,
        "person.created",
        "person",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if Some(id) != user.person_id {
        user.require_action("person.manage")?;
    }
    let daily = payload.get("daily_standard_hours").and_then(Value::as_f64);
    if daily.is_some_and(|h| h <= 0.0) {
        return Err(ApiError::bad_request("daily_standard_hours must be > 0"));
    }
    let before = get_json_by_id(&state.db, "persons", id).await?;
    sqlx::query(
        "UPDATE persons SET
          name = COALESCE($2, name),
          employee_no = COALESCE($3, employee_no),
          primary_org_id = COALESCE($4, primary_org_id),
          management_level = COALESCE($5, management_level),
          professional_level = COALESCE($6, professional_level),
          system_role_ids = COALESCE($7, system_role_ids),
          work_status = COALESCE($8, work_status),
          daily_standard_hours = COALESCE($9, daily_standard_hours),
          dispatch_enabled = COALESCE($10, dispatch_enabled),
          account_status = COALESCE($11, account_status),
          payload = payload || $12,
          updated_at = now(),
          version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("employee_no").and_then(Value::as_str))
    .bind(value_uuid(&payload, "primary_org_id"))
    .bind(payload.get("management_level").and_then(Value::as_str))
    .bind(payload.get("professional_level").and_then(Value::as_str))
    .bind(if payload.get("system_role_ids").is_some() {
        Some(value_uuid_vec(&payload, "system_role_ids"))
    } else {
        None
    })
    .bind(payload.get("work_status").and_then(Value::as_str))
    .bind(daily)
    .bind(payload.get("dispatch_enabled").and_then(Value::as_bool))
    .bind(payload.get("account_status").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    sync_person_org_memberships(&state.db, id, &payload).await?;
    audit(
        &state.db,
        user.person_id,
        "person",
        Some(id),
        "person.updated",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "person.updated",
        "person",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn disable_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    sqlx::query("UPDATE persons SET work_status = 'disabled', dispatch_enabled = false, account_status = 'disabled', updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE accounts SET status = 'disabled', updated_at = now() WHERE person_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "person.disabled",
        "person",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "disabled": true })))
}

async fn user_workload_summary(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
            'date', work_date,
            'committed_hours', committed_hours::float8,
            'standard_hours', standard_hours::float8,
            'load_rate', load_rate::float8,
            'full_day_occupied', full_day_occupied
          ) AS item
         FROM workload_snapshots
         WHERE person_id = $1 AND work_date BETWEEN current_date AND current_date + interval '14 days'
         ORDER BY work_date",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let items = rows
        .iter()
        .map(|r| json_row(r, "item"))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "person_id": id, "items": items })))
}

async fn get_json_by_id(db: &PgPool, table: &str, id: Uuid) -> Result<Value, ApiError> {
    let allowed = [
        "accounts",
        "organizations",
        "persons",
        "skill_tags",
        "roles",
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
