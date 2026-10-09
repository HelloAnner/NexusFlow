use chrono::{Datelike, Local};

async fn dashboard_home_summary(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let scope = data_scope_context(&state.db, &user).await?;
    let now = Utc::now();
    let local = Local::now();

    let role_label = if user.is_sa() {
        "系统管理员"
    } else {
        user.role_codes.first().map(String::as_str).unwrap_or("employee")
    };

    let command_band = build_command_band(&state.db, &user, &scope, now)
        .await
        .unwrap_or_else(|_| json!({}));
    let signals = build_signals(&command_band)
        .await
        .unwrap_or_else(|_| json!({}));
    let focus_items = build_focus_stream(&state.db, &user, &scope, now)
        .await
        .unwrap_or_else(|_| json!([]));
    let risk_radar = build_risk_radar(&state.db, &user, &scope, now)
        .await
        .unwrap_or_else(|_| json!({}));
    let timeline = build_timeline(&state.db, &user, &scope, now)
        .await
        .unwrap_or_else(|_| json!([]));
    let projects = build_project_pulse(&state.db, &user, &scope, now)
        .await
        .unwrap_or_else(|_| json!([]));
    let inbox = build_inbox_triage(&state.db, &user, now)
        .await
        .unwrap_or_else(|_| json!([]));
    let quick_tools = build_quick_dock(&state.db, &user)
        .await
        .unwrap_or_else(|_| json!([]));
    let activities = build_recent_activities(&state.db, &user, &scope)
        .await
        .unwrap_or_else(|_| json!([]));
    let team_load = build_team_load(&state.db, &user, &scope, now)
        .await
        .unwrap_or(Value::Null);

    Ok(Json(json!({
        "greeting": {
            "name": user.login_name,
            "date_text": format!("{}年{}月{}日 {}", local.year(), local.month(), local.day(), weekday_cn(local.weekday())),
            "role_label": role_label,
        },
        "summary_text": build_summary_text(&command_band),
        "today": command_band,
        "signals": signals,
        "focus_items": focus_items,
        "timeline": timeline,
        "risk_radar": risk_radar,
        "projects": projects,
        "inbox": inbox,
        "activities": activities,
        "team_load": team_load,
        "quick_tools": quick_tools,
    })))
}

fn build_summary_text(band: &Value) -> String {
    let todos = band["action_count"].as_i64().unwrap_or(0);
    let due = band["due_count"].as_i64().unwrap_or(0);
    let conflicts = band["conflict_count"].as_i64().unwrap_or(0);
    if conflicts > 0 && due > 0 {
        format!("今天有 {} 项待处理，{} 个冲突需要在 18:00 前协调", todos, conflicts)
    } else if due > 0 {
        format!("今天有 {} 项任务截止，请优先处理", due)
    } else if todos > 0 {
        format!("你还有 {} 项待办，保持节奏", todos)
    } else {
        "暂无紧急事项，可以规划下一步工作".to_string()
    }
}

async fn build_command_band(
    db: &PgPool,
    user: &CurrentUser,
    _scope: &DataScopeContext,
    now: DateTime<Utc>,
) -> Result<Value, ApiError> {
    let today = now.date_naive();
    let pid = user.person_id;

    let action_count: i64 = if let Some(pid) = pid {
        sqlx::query_scalar("SELECT count(*) FROM todo_items WHERE assignee_id = $1 AND status = 'open'")
            .bind(pid)
            .fetch_one(db)
            .await?
    } else if user.is_sa() {
        sqlx::query_scalar("SELECT count(*) FROM todo_items WHERE status = 'open'")
            .fetch_one(db)
            .await?
    } else {
        0
    };

    let due_count: i64 = if let Some(pid) = pid {
        sqlx::query_scalar(
            "SELECT count(*) FROM tasks t
             WHERE t.deleted_at IS NULL
               AND t.status NOT IN ('completed','archived')
               AND t.due_at::date = $1
               AND (t.owner_id = $2 OR t.acceptor_id = $2 OR t.initiator_id = $2
                    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $2)
                    OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $2 OR $2 = ANY(ta.collaborator_ids))))"
        )
        .bind(today)
        .bind(pid)
        .fetch_one(db)
        .await?
    } else if user.is_sa() {
        sqlx::query_scalar(
            "SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status NOT IN ('completed','archived') AND due_at::date = $1"
        )
        .bind(today)
        .fetch_one(db)
        .await?
    } else {
        0
    };

    let conflict_count: i64 = if user.is_sa() {
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open'")
            .fetch_one(db)
            .await?
    } else if let Some(pid) = pid {
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open' AND person_id = $1")
            .bind(pid)
            .fetch_one(db)
            .await?
    } else {
        0
    };

    let approval_count: i64 = if let Some(pid) = pid {
        sqlx::query_scalar("SELECT count(*) FROM approval_tickets WHERE status = 'pending' AND $1 = ANY(target_person_ids)")
            .bind(pid)
            .fetch_one(db)
            .await?
    } else if user.is_sa() {
        sqlx::query_scalar("SELECT count(*) FROM approval_tickets WHERE status = 'pending'")
            .fetch_one(db)
            .await?
    } else {
        0
    };

    let resource_gap_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM resource_requirements rr
         WHERE rr.required = true
           AND NOT EXISTS (
             SELECT 1 FROM resource_links rl
             JOIN resource_files rf ON rf.id = rl.resource_id
             WHERE rl.object_type = rr.object_type AND rl.object_id = rr.object_id
               AND rf.deleted_at IS NULL
           )"
    )
    .fetch_one(db)
    .await
    .unwrap_or(0);

    let high_risk: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM risk_records WHERE status = 'open' AND risk_level IN ('high','critical')"
    )
    .fetch_one(db)
    .await
    .unwrap_or(0);

    let system_status = if high_risk > 0 || conflict_count > 10 {
        "warning"
    } else {
        "normal"
    };

    Ok(json!({
        "action_count": action_count,
        "due_count": due_count,
        "conflict_count": conflict_count,
        "approval_count": approval_count,
        "resource_gap_count": resource_gap_count,
        "system_status": system_status,
    }))
}

async fn build_signals(band: &Value) -> Result<Value, ApiError> {
    Ok(json!({
        "todo_trend": {
            "value": band["action_count"].as_i64().unwrap_or(0),
            "label": "待办趋势",
            "sub": "今日未处理",
            "trend": [0,0,0,0,0,0,band["action_count"].as_i64().unwrap_or(0)],
            "variant": "info",
        },
        "task_pressure": {
            "value": band["due_count"].as_i64().unwrap_or(0),
            "label": "任务压力",
            "sub": "今日截止",
            "variant": "warning",
        },
        "risk_heat": {
            "value": band["conflict_count"].as_i64().unwrap_or(0),
            "label": "风险热度",
            "sub": "本周冲突",
            "variant": "error",
        },
        "resource_gap": {
            "value": band["resource_gap_count"].as_i64().unwrap_or(0),
            "label": "资料缺口",
            "sub": "待补齐",
            "variant": "warning",
        },
        "tool_recommend": {
            "value": 2,
            "label": "工具推荐",
            "sub": "常用工具",
            "variant": "success",
        },
    }))
}

async fn build_timeline(
    db: &PgPool,
    user: &CurrentUser,
    _scope: &DataScopeContext,
    now: DateTime<Utc>,
) -> Result<Value, ApiError> {
    let today = now.date_naive();
    let week_later = today + chrono::Duration::days(7);
    let pid = user.person_id;

    let task_rows = if let Some(pid) = pid {
        sqlx::query(
            "SELECT t.id, t.name, t.start_at, t.due_at, t.priority, p.name AS project_name, owner.name AS owner_name
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN persons owner ON owner.id = t.owner_id
             WHERE t.deleted_at IS NULL
               AND t.status NOT IN ('completed','archived')
               AND t.due_at IS NOT NULL
               AND t.due_at::date <= $1
               AND (t.owner_id = $2 OR t.acceptor_id = $2 OR t.initiator_id = $2
                    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $2)
                    OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $2 OR $2 = ANY(ta.collaborator_ids))))
             ORDER BY t.due_at ASC
             LIMIT 30"
        )
        .bind(week_later)
        .bind(pid)
        .fetch_all(db)
        .await?
    } else if user.is_sa() {
        sqlx::query(
            "SELECT t.id, t.name, t.start_at, t.due_at, t.priority, p.name AS project_name, owner.name AS owner_name
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN persons owner ON owner.id = t.owner_id
             WHERE t.deleted_at IS NULL
               AND t.status NOT IN ('completed','archived')
               AND t.due_at IS NOT NULL
               AND t.due_at::date <= $1
             ORDER BY t.due_at ASC
             LIMIT 30"
        )
        .bind(week_later)
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };

    let mut items = Vec::new();
    for r in task_rows {
        let id: Uuid = r.get("id");
        let name: String = r.get("name");
        let start_at: Option<DateTime<Utc>> = r.try_get("start_at").ok().flatten();
        let due_at: Option<DateTime<Utc>> = r.try_get("due_at").ok().flatten();
        let priority: String = r.try_get("priority").ok().unwrap_or_else(|| "normal".to_string());
        let project_name: Option<String> = r.try_get("project_name").ok();
        let owner_name: Option<String> = r.try_get("owner_name").ok();
        items.push(json!({
            "id": format!("task-{}", id),
            "title": name,
            "type": "task",
            "start": start_at.map(|d| d.to_rfc3339()),
            "end": due_at.map(|d| d.to_rfc3339()),
            "project_name": project_name,
            "owner_name": owner_name,
            "risk_level": if priority == "urgent" { "high" } else { "" },
            "target_url": format!("/tasks?task={}", id),
        }));
    }

    let conflict_rows = if user.is_sa() {
        sqlx::query("SELECT id, task_id, task_name, conflict_date_start, risk_level FROM conflict_records WHERE status = 'open' AND conflict_date_start <= $1 LIMIT 10")
            .bind(week_later)
            .fetch_all(db)
            .await?
    } else if let Some(pid) = pid {
        sqlx::query("SELECT id, task_id, task_name, conflict_date_start, risk_level FROM conflict_records WHERE status = 'open' AND person_id = $1 AND conflict_date_start <= $2 LIMIT 10")
            .bind(pid)
            .bind(week_later)
            .fetch_all(db)
            .await?
    } else {
        Vec::new()
    };
    for r in conflict_rows {
        let id: Uuid = r.get("id");
        let task_name: Option<String> = r.try_get("task_name").ok();
        let conflict_date_start: Option<chrono::NaiveDate> = r.try_get("conflict_date_start").ok().flatten();
        let risk_level: String = r.try_get("risk_level").ok().unwrap_or_else(|| "medium".to_string());
        items.push(json!({
            "id": format!("conflict-{}", id),
            "title": task_name.unwrap_or_else(|| format!("冲突 #{}", id)),
            "type": "conflict",
            "date": conflict_date_start.map(|d| d.to_string()),
            "risk_level": risk_level,
            "target_url": format!("/conflicts?conflict={}", id),
        }));
    }

    Ok(json!(items))
}

async fn build_project_pulse(
    db: &PgPool,
    user: &CurrentUser,
    _scope: &DataScopeContext,
    now: DateTime<Utc>,
) -> Result<Value, ApiError> {
    let today = now.date_naive();
    let week_ago = today - chrono::Duration::days(7);
    let pid = user.person_id;

    let project_rows = if let Some(pid) = pid {
        sqlx::query(
            "SELECT p.id, p.name, p.end_date, p.status,
                    leader.name AS leader_name,
                    (SELECT count(*) FROM conflict_records c JOIN tasks t ON t.id = c.task_id WHERE t.project_id = p.id AND c.status = 'open') AS risk_count,
                    (SELECT count(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL AND created_at::date >= $1) AS new_tasks,
                    (SELECT count(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL AND status IN ('completed','archived') AND updated_at::date >= $1) AS completed_tasks
             FROM projects p
             LEFT JOIN persons leader ON leader.id = p.leader_id
             WHERE p.deleted_at IS NULL
               AND (p.leader_id = $2 OR p.managed_by_id = $2 OR EXISTS (
                 SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $2 AND pm.active
               ))
             ORDER BY risk_count DESC, p.updated_at DESC
             LIMIT 5"
        )
        .bind(week_ago)
        .bind(pid)
        .fetch_all(db)
        .await?
    } else if user.is_sa() {
        sqlx::query(
            "SELECT p.id, p.name, p.end_date, p.status,
                    leader.name AS leader_name,
                    (SELECT count(*) FROM conflict_records c JOIN tasks t ON t.id = c.task_id WHERE t.project_id = p.id AND c.status = 'open') AS risk_count,
                    (SELECT count(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL AND created_at::date >= $1) AS new_tasks,
                    (SELECT count(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL AND status IN ('completed','archived') AND updated_at::date >= $1) AS completed_tasks
             FROM projects p
             LEFT JOIN persons leader ON leader.id = p.leader_id
             WHERE p.deleted_at IS NULL
             ORDER BY risk_count DESC, p.updated_at DESC
             LIMIT 5"
        )
        .bind(week_ago)
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };

    let mut items = Vec::new();
    for r in project_rows {
        let id: Uuid = r.get("id");
        let name: String = r.get("name");
        let end_date: Option<chrono::NaiveDate> = r.try_get("end_date").ok().flatten();
        let status: String = r.try_get("status").ok().unwrap_or_else(|| "preparing".to_string());
        let leader_name: Option<String> = r.try_get("leader_name").ok();
        let risk_count: i64 = r.try_get("risk_count").ok().unwrap_or(0);
        let new_tasks: i64 = r.try_get("new_tasks").ok().unwrap_or(0);
        let completed_tasks: i64 = r.try_get("completed_tasks").ok().unwrap_or(0);
        let total_tasks: i64 = sqlx::query_scalar("SELECT count(*) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_one(db)
            .await
            .unwrap_or(0);
        let completed_total: i64 = sqlx::query_scalar("SELECT count(*) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL AND status IN ('completed','archived')")
            .bind(id)
            .fetch_one(db)
            .await
            .unwrap_or(0);
        let progress = if total_tasks > 0 { (completed_total * 100 / total_tasks) as i32 } else { 0 };

        let member_rows = sqlx::query("SELECT person.name FROM project_members pm JOIN persons person ON person.id = pm.person_id WHERE pm.project_id = $1 AND pm.active LIMIT 4")
            .bind(id)
            .fetch_all(db)
            .await
            .unwrap_or_default();
        let member_names: Vec<String> = member_rows.iter().map(|r| r.get::<String, _>("name")).collect();

        items.push(json!({
            "id": id,
            "name": name,
            "progress": progress,
            "milestone": end_date.map(|d| format!("计划结束 {}", d)),
            "milestone_date": end_date.map(|d| d.to_string()),
            "risk_count": risk_count,
            "new_tasks": new_tasks,
            "completed_tasks": completed_tasks,
            "member_names": member_names,
            "leader_name": leader_name,
            "target_url": format!("/projects?project={}", id),
            "health": if risk_count > 0 { "error" } else if status == "paused" { "warning" } else { "success" },
        }));
    }

    Ok(json!(items))
}

async fn build_inbox_triage(
    db: &PgPool,
    user: &CurrentUser,
    now: DateTime<Utc>,
) -> Result<Value, ApiError> {
    let pid = user.person_id;
    let rows = if let Some(pid) = pid {
        sqlx::query(
            "SELECT id, todo_type, title, target_type, target_id, due_at, action_url
             FROM todo_items
             WHERE status = 'open' AND assignee_id = $1
               AND (due_at IS NULL OR due_at >= $2 OR due_at::date >= $3)
             ORDER BY due_at ASC NULLS LAST
             LIMIT 15"
        )
        .bind(pid)
        .bind(now - Duration::days(1))
        .bind(now.date_naive() - chrono::Duration::days(1))
        .fetch_all(db)
        .await?
    } else if user.is_sa() {
        sqlx::query(
            "SELECT id, todo_type, title, target_type, target_id, due_at, action_url
             FROM todo_items
             WHERE status = 'open'
               AND (due_at IS NULL OR due_at >= $1 OR due_at::date >= $2)
             ORDER BY due_at ASC NULLS LAST
             LIMIT 15"
        )
        .bind(now - Duration::days(1))
        .bind(now.date_naive() - chrono::Duration::days(1))
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };

    let mut items = Vec::new();
    for r in rows {
        let id: Uuid = r.get("id");
        let todo_type: String = r.get("todo_type");
        let title: String = r.get("title");
        let target_type: String = r.get("target_type");
        let target_id: Option<Uuid> = r.try_get("target_id").ok().flatten();
        let due_at: Option<DateTime<Utc>> = r.try_get("due_at").ok().flatten();
        let action_url: String = r.get("action_url");
        let source = target_id.map(|tid| format!("{} / {}", target_type, tid)).unwrap_or_else(|| target_type.clone());
        items.push(json!({
            "id": id,
            "title": title,
            "type": inbox_type_frontend(&todo_type),
            "source": source,
            "due_text": format_sla(due_at, now),
            "target_url": if action_url.is_empty() { format!("/todos?todo={}", id) } else { action_url },
            "todo_id": id,
        }));
    }

    Ok(json!(items))
}

async fn build_quick_dock(db: &PgPool, user: &CurrentUser) -> Result<Value, ApiError> {
    let mut tools = vec![
        json!({"id": "new-task", "name": "新建任务", "icon": "plus-square", "target": "/tasks/new"}),
        json!({"id": "new-project", "name": "新建项目", "icon": "folder-plus", "target": "/projects?create=1"}),
        json!({"id": "gantt", "name": "打开甘特", "icon": "calendar-days", "target": "/gantt"}),
        json!({"id": "reports", "name": "打开报表", "icon": "bar-chart-3", "target": "/reports"}),
        json!({"id": "upload", "name": "上传资料", "icon": "upload", "target": "/resources?upload=1"}),
    ];

    let tool_rows = sqlx::query("SELECT id, name, icon, entry_url FROM tool_entries WHERE enabled = true ORDER BY created_at DESC LIMIT 6")
        .fetch_all(db)
        .await
        .unwrap_or_default();
    for r in tool_rows {
        let id: Uuid = r.get("id");
        let name: String = r.get("name");
        let icon: String = r.try_get("icon").ok().unwrap_or_else(|| "wrench".to_string());
        let entry_url: String = r.try_get("entry_url").ok().unwrap_or_default();
        if user.is_sa() {
            tools.push(json!({
                "id": id,
                "name": name,
                "icon": if icon.is_empty() { "wrench" } else { &icon },
                "target": if entry_url.is_empty() { format!("/tools/{}", id) } else { entry_url },
            }));
        }
    }

    Ok(json!(tools))
}

async fn build_recent_activities(
    db: &PgPool,
    user: &CurrentUser,
    _scope: &DataScopeContext,
) -> Result<Value, ApiError> {
    user.require_business_access()?;
    let pid = user.person_id;
    let rows = if user.is_sa() {
        sqlx::query("SELECT id, event_type, object_type, object_id, payload, created_at FROM domain_events ORDER BY created_at DESC LIMIT 20")
            .fetch_all(db)
            .await?
    } else if let Some(pid) = pid {
        sqlx::query(
            "SELECT id, event_type, object_type, object_id, payload, created_at
             FROM domain_events
             WHERE actor_id = $1 OR payload->>'person_id' = $2 OR payload->>'owner_id' = $2
             ORDER BY created_at DESC LIMIT 20"
        )
        .bind(pid)
        .bind(pid.to_string())
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };

    let mut items = Vec::new();
    for r in rows {
        let id: Uuid = r.get("id");
        let event_type: String = r.get("event_type");
        let object_type: String = r.try_get("object_type").ok().unwrap_or_default();
        let object_id: Option<Uuid> = r.try_get("object_id").ok().flatten();
        let payload: Value = r.get("payload");
        let created_at: DateTime<Utc> = r.get("created_at");
        let actor_name = payload.get("actor_name").and_then(Value::as_str).unwrap_or("系统");
        let title = payload.get("title").and_then(Value::as_str)
            .or_else(|| payload.get("name").and_then(Value::as_str))
            .unwrap_or("");
        let action = if event_type.contains("created") { "创建了" }
            else if event_type.contains("updated") { "更新了" }
            else if event_type.contains("submitted") { "提交了" }
            else if event_type.contains("confirmed") { "确认了" }
            else if event_type.contains("accepted") { "验收了" }
            else if event_type.contains("rejected") { "驳回了" }
            else if event_type.contains("resolved") { "解决了" }
            else if event_type.contains("cancelled") { "取消了" }
            else { &event_type };
        let target_url = object_id.map(|oid| match object_type.as_str() {
            "task" => format!("/tasks?task={}", oid),
            "project" => format!("/projects?project={}", oid),
            "person" => format!("/people?person={}", oid),
            _ => format!("/{}/{}", object_type, oid),
        });
        let risk_level = if event_type.contains("conflict") || event_type.contains("rejected") || event_type.contains("risk") {
            Some("high")
        } else {
            None
        };
        items.push(json!({
            "id": id,
            "actor": actor_name,
            "action": action,
            "object": format!("{} {}", object_type, title).trim().to_string(),
            "object_type": object_type,
            "time": created_at.to_rfc3339(),
            "risk_level": risk_level,
            "target_url": target_url,
        }));
    }

    Ok(json!(items))
}

async fn build_team_load(
    db: &PgPool,
    user: &CurrentUser,
    _scope: &DataScopeContext,
    now: DateTime<Utc>,
) -> Result<Value, ApiError> {
    if !user.role_codes.iter().any(|r| matches!(r.as_str(), "task_manager" | "department_manager" | "center_manager" | "sa")) {
        return Ok(Value::Null);
    }
    let today = now.date_naive();
    let pid = user.person_id;
    let person_rows = if user.is_sa() {
        sqlx::query("SELECT id, name FROM persons WHERE work_status = 'active' AND deleted_at IS NULL ORDER BY name LIMIT 10")
            .fetch_all(db)
            .await?
    } else if let Some(pid) = pid {
        sqlx::query(
            "SELECT DISTINCT p.id, p.name
             FROM persons p
             JOIN project_members pm ON pm.person_id = p.id
             WHERE p.work_status = 'active' AND p.deleted_at IS NULL
               AND EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.project_id = pm.project_id AND pm2.person_id = $1 AND pm2.active)
             ORDER BY p.name LIMIT 10"
        )
        .bind(pid)
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };

    let mut members = Vec::new();
    for r in person_rows {
        let person_id: Uuid = r.get("id");
        let name: String = r.get("name");
        let mut values = Vec::new();
        let mut blocked = false;
        for offset in 0..7i64 {
            let day = today + chrono::Duration::days(offset);
            let rate: Option<f64> = sqlx::query_scalar(
                "SELECT load_rate FROM workload_snapshots WHERE person_id = $1 AND work_date = $2"
            )
            .bind(person_id)
            .bind(day)
            .fetch_optional(db)
            .await?;
            let v = (rate.unwrap_or(0.0) * 100.0) as i32;
            if v >= 100 {
                blocked = true;
            }
            values.push(v);
        }
        members.push(json!({
            "id": person_id,
            "name": name,
            "values": values,
            "blocked": blocked,
        }));
    }

    members.sort_by(|a, b| {
        let a_blocked = a["blocked"].as_bool().unwrap_or(false);
        let b_blocked = b["blocked"].as_bool().unwrap_or(false);
        b_blocked.cmp(&a_blocked)
    });

    Ok(json!(members))
}
