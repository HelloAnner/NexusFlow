fn weekday_cn(wd: chrono::Weekday) -> &'static str {
    match wd {
        chrono::Weekday::Mon => "周一",
        chrono::Weekday::Tue => "周二",
        chrono::Weekday::Wed => "周三",
        chrono::Weekday::Thu => "周四",
        chrono::Weekday::Fri => "周五",
        chrono::Weekday::Sat => "周六",
        chrono::Weekday::Sun => "周日",
    }
}

fn format_sla(due: Option<DateTime<Utc>>, now: DateTime<Utc>) -> String {
    let due = match due {
        Some(d) => d,
        None => return "无截止".to_string(),
    };
    let hours = (due - now).num_hours();
    if hours < 0 {
        format!("逾期 {}h", -hours)
    } else if hours < 1 {
        format!("{}m left", (due - now).num_minutes().max(0))
    } else {
        format!("{}h left", hours)
    }
}

fn todo_action_text(todo_type: &str) -> &'static str {
    match todo_type {
        "approval" => "需要你审批",
        "fill" | "report" => "需要你填报",
        "acceptance" => "需要你验收",
        "conflict" => "需要协调",
        _ => "需要处理",
    }
}

fn inbox_type_frontend(todo_type: &str) -> &'static str {
    match todo_type {
        "approval" => "approval",
        "fill" | "report" => "report",
        "acceptance" => "acceptance",
        "conflict" => "conflict",
        _ => "other",
    }
}

fn focus_variant(due: Option<DateTime<Utc>>, now: DateTime<Utc>) -> &'static str {
    match due {
        Some(d) if d < now => "error",
        Some(d) if d.date_naive() == now.date_naive() => "warning",
        _ => "info",
    }
}

async fn build_focus_stream(
    db: &PgPool,
    user: &CurrentUser,
    _scope: &DataScopeContext,
    now: DateTime<Utc>,
) -> Result<Value, ApiError> {
    let today = now.date_naive();
    let week_later = now + Duration::days(7);
    let pid = user.person_id;
    let mut items: Vec<(i32, DateTime<Utc>, Value)> = Vec::new();

    let task_rows = if let Some(pid) = pid {
        sqlx::query(
            "SELECT t.id, t.name, t.project_id, p.name AS project_name, t.owner_id, owner.name AS owner_name,
                    t.due_at, t.status,
                    (SELECT count(*) FROM task_assignments ta WHERE ta.task_id = t.id) AS assignee_count
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN persons owner ON owner.id = t.owner_id
             WHERE t.deleted_at IS NULL
               AND t.status NOT IN ('completed','archived')
               AND (t.due_at < $1 OR t.due_at::date = $2 OR t.due_at <= $3)
               AND (t.owner_id = $4 OR t.acceptor_id = $4 OR t.initiator_id = $4
                    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4)
                    OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $4 OR $4 = ANY(ta.collaborator_ids))))
             ORDER BY t.due_at ASC
             LIMIT 20"
        )
        .bind(now)
        .bind(today)
        .bind(week_later)
        .bind(pid)
        .fetch_all(db)
        .await?
    } else if user.is_sa() {
        sqlx::query(
            "SELECT t.id, t.name, t.project_id, p.name AS project_name, t.owner_id, owner.name AS owner_name,
                    t.due_at, t.status,
                    (SELECT count(*) FROM task_assignments ta WHERE ta.task_id = t.id) AS assignee_count
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN persons owner ON owner.id = t.owner_id
             WHERE t.deleted_at IS NULL
               AND t.status NOT IN ('completed','archived')
               AND (t.due_at < $1 OR t.due_at::date = $2 OR t.due_at <= $3)
             ORDER BY t.due_at ASC
             LIMIT 20"
        )
        .bind(now)
        .bind(today)
        .bind(week_later)
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };

    for r in task_rows {
        let id: Uuid = r.get("id");
        let name: String = r.get("name");
        let project_name: Option<String> = r.try_get("project_name").ok();
        let owner_name: Option<String> = r.try_get("owner_name").ok();
        let due_at: Option<DateTime<Utc>> = r.try_get("due_at").ok().flatten();
        let count: i64 = r.get("assignee_count");
        let variant = focus_variant(due_at, now);
        let (score, action_text) = match due_at {
            Some(d) if d < now => (0, "已逾期，需要处理"),
            Some(d) if d.date_naive() == today => (1, "今日截止"),
            _ => (3, "本周到期"),
        };
        let source = format!("{} / {}", project_name.unwrap_or_else(|| "-".to_string()), owner_name.unwrap_or_else(|| "-".to_string()));
        items.push((score, due_at.unwrap_or(now), json!({
            "id": format!("task-{}", id),
            "title": name,
            "source": source,
            "action": action_text,
            "status_variant": variant,
            "sla_text": format_sla(due_at, now),
            "impact": format!("影响 {} 人", count),
            "target_url": format!("/tasks?task={}", id),
            "type": "task",
            "object_id": id,
        })));
    }

    if let Some(pid) = pid {
        let todo_rows = sqlx::query(
            "SELECT id, todo_type, title, target_type, target_id, due_at, action_url
             FROM todo_items
             WHERE status = 'open' AND assignee_id = $1
               AND (due_at IS NULL OR due_at < $2 OR due_at::date = $3 OR due_at <= $4)
             ORDER BY due_at ASC NULLS LAST
             LIMIT 20"
        )
        .bind(pid)
        .bind(now)
        .bind(today)
        .bind(week_later)
        .fetch_all(db)
        .await?;

        for r in todo_rows {
            let id: Uuid = r.get("id");
            let todo_type: String = r.get("todo_type");
            let title: String = r.get("title");
            let target_type: String = r.get("target_type");
            let target_id: Option<Uuid> = r.try_get("target_id").ok().flatten();
            let due_at: Option<DateTime<Utc>> = r.try_get("due_at").ok().flatten();
            let action_url: String = r.get("action_url");
            let variant = focus_variant(due_at, now);
            let score = match due_at {
                Some(d) if d < now => 0,
                Some(d) if d.date_naive() == today => 1,
                _ => 3,
            };
            let source = target_id.map(|tid| format!("{} / {}", target_type, tid)).unwrap_or_else(|| target_type.clone());
            items.push((score, due_at.unwrap_or(now), json!({
                "id": format!("todo-{}", id),
                "title": title,
                "source": source,
                "action": todo_action_text(&todo_type),
                "status_variant": variant,
                "sla_text": format_sla(due_at, now),
                "impact": "",
                "target_url": if action_url.is_empty() { format!("/todos?todo={}", id) } else { action_url },
                "type": inbox_type_frontend(&todo_type),
                "object_id": target_id.unwrap_or(id),
            })));
        }
    }

    let conflict_rows = if user.is_sa() {
        sqlx::query("SELECT id, conflict_type, risk_level, created_at FROM conflict_records WHERE status = 'open' LIMIT 10")
            .fetch_all(db)
            .await?
    } else if let Some(pid) = pid {
        sqlx::query("SELECT id, conflict_type, risk_level, created_at FROM conflict_records WHERE status = 'open' AND person_id = $1 LIMIT 10")
            .bind(pid)
            .fetch_all(db)
            .await?
    } else {
        Vec::new()
    };
    for r in conflict_rows {
        let id: Uuid = r.get("id");
        let conflict_type: String = r.get("conflict_type");
        let risk_level: String = r.get("risk_level");
        let created_at: DateTime<Utc> = r.get("created_at");
        let score = if risk_level == "high" || risk_level == "critical" { 2 } else { 3 };
        let variant = if risk_level == "high" || risk_level == "critical" { "error" } else { "warning" };
        items.push((score, created_at, json!({
            "id": format!("conflict-{}", id),
            "title": conflict_type,
            "source": format!("冲突 #{}", id),
            "action": "需要协调",
            "status_variant": variant,
            "sla_text": format_sla(Some(created_at + Duration::hours(24)), now),
            "impact": "",
            "target_url": format!("/conflicts?conflict={}", id),
            "type": "conflict",
            "object_id": id,
        })));
    }

    let approval_rows = if user.is_sa() {
        sqlx::query("SELECT id, ticket_type, created_at FROM approval_tickets WHERE status = 'pending' LIMIT 10")
            .fetch_all(db)
            .await?
    } else if let Some(pid) = pid {
        sqlx::query("SELECT id, ticket_type, created_at FROM approval_tickets WHERE status = 'pending' AND $1 = ANY(target_person_ids) LIMIT 10")
            .bind(pid)
            .fetch_all(db)
            .await?
    } else {
        Vec::new()
    };
    for r in approval_rows {
        let id: Uuid = r.get("id");
        let ticket_type: String = r.get("ticket_type");
        let created_at: DateTime<Utc> = r.get("created_at");
        items.push((2, created_at, json!({
            "id": format!("approval-{}", id),
            "title": ticket_type,
            "source": "审批流",
            "action": "需要你审批",
            "status_variant": "info",
            "sla_text": format_sla(Some(created_at + Duration::hours(24)), now),
            "impact": "",
            "target_url": format!("/approvals?approval={}", id),
            "type": "approval",
            "object_id": id,
        })));
    }

    items.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    let result: Vec<Value> = items
        .into_iter()
        .take(20)
        .enumerate()
        .map(|(i, (_, _, mut item))| {
            item["rank"] = json!(i + 1);
            item
        })
        .collect();
    Ok(json!(result))
}

async fn build_risk_radar(
    db: &PgPool,
    user: &CurrentUser,
    _scope: &DataScopeContext,
    now: DateTime<Utc>,
) -> Result<Value, ApiError> {
    let today = now.date_naive();
    let three_days = today + chrono::Duration::days(3);

    let risk_rows = sqlx::query("SELECT risk_level, count(*) AS c FROM risk_records WHERE status = 'open' GROUP BY risk_level")
        .fetch_all(db)
        .await
        .unwrap_or_default();
    let mut high = 0i64;
    let mut medium = 0i64;
    let mut low = 0i64;
    for r in &risk_rows {
        let level: String = r.get("risk_level");
        let c: i64 = r.get("c");
        match level.as_str() {
            "high" | "critical" => high += c,
            "medium" => medium += c,
            "low" => low += c,
            _ => {}
        }
    }

    let overdue: i64 = if user.is_sa() {
        sqlx::query_scalar(
            "SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status NOT IN ('completed','archived') AND due_at < $1"
        )
        .bind(now)
        .fetch_one(db)
        .await?
    } else if let Some(pid) = user.person_id {
        sqlx::query_scalar(
            "SELECT count(*) FROM tasks t
             WHERE t.deleted_at IS NULL AND t.status NOT IN ('completed','archived')
               AND t.due_at < $1
               AND (t.owner_id = $2 OR t.acceptor_id = $2 OR t.initiator_id = $2
                    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $2)
                    OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $2 OR $2 = ANY(ta.collaborator_ids))))"
        )
        .bind(now)
        .bind(pid)
        .fetch_one(db)
        .await?
    } else {
        0
    };

    let resource_conflict: i64 = if user.is_sa() {
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open'").fetch_one(db).await?
    } else if let Some(pid) = user.person_id {
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open' AND person_id = $1").bind(pid).fetch_one(db).await?
    } else {
        0
    };

    let approval_pending: i64 = if let Some(pid) = user.person_id {
        sqlx::query_scalar("SELECT count(*) FROM approval_tickets WHERE status = 'pending' AND $1 = ANY(target_person_ids)")
            .bind(pid)
            .fetch_one(db)
            .await?
    } else if user.is_sa() {
        sqlx::query_scalar("SELECT count(*) FROM approval_tickets WHERE status = 'pending'").fetch_one(db).await?
    } else {
        0
    };

    let resource_gap: i64 = sqlx::query_scalar(
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

    let due_soon: i64 = if user.is_sa() {
        sqlx::query_scalar(
            "SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status NOT IN ('completed','archived')
             AND due_at::date <= $1 AND due_at::date >= $2"
        )
        .bind(three_days)
        .bind(today)
        .fetch_one(db)
        .await?
    } else if let Some(pid) = user.person_id {
        sqlx::query_scalar(
            "SELECT count(*) FROM tasks t
             WHERE t.deleted_at IS NULL AND t.status NOT IN ('completed','archived')
               AND t.due_at::date <= $1 AND t.due_at::date >= $2
               AND (t.owner_id = $3 OR t.acceptor_id = $3 OR t.initiator_id = $3
                    OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $3)
                    OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $3 OR $3 = ANY(ta.collaborator_ids))))"
        )
        .bind(three_days)
        .bind(today)
        .bind(pid)
        .fetch_one(db)
        .await?
    } else {
        0
    };

    let mut actions = Vec::new();
    if resource_conflict > 0 {
        actions.push(json!({"label": "处理最高风险冲突", "icon": "alert-triangle", "target": "/conflicts"}));
    }
    if high > 0 {
        actions.push(json!({"label": "查看高风险项", "icon": "shield-alert", "target": "/tasks?filter=risk"}));
    }
    if overdue > 0 || due_soon > 0 {
        actions.push(json!({"label": "处理即将逾期任务", "icon": "clock", "target": "/tasks"}));
    }
    if actions.is_empty() {
        actions.push(json!({"label": "查看全部任务", "icon": "list", "target": "/tasks"}));
    }

    Ok(json!({
        "high": high,
        "medium": medium,
        "low": low,
        "matrix": {
            "overdue": overdue,
            "resource_conflict": resource_conflict,
            "resource_gap": resource_gap,
            "approval_pending": approval_pending,
        },
        "recommended_actions": actions,
    }))
}
