#[derive(Clone, Debug)]
struct DataScopeContext {
    unrestricted: bool,
    all_orgs: bool,
    all_projects: bool,
    org_ids: Vec<Uuid>,
    project_ids: Vec<Uuid>,
}

impl DataScopeContext {
    fn unrestricted() -> Self {
        Self {
            unrestricted: true,
            all_orgs: true,
            all_projects: true,
            org_ids: Vec::new(),
            project_ids: Vec::new(),
        }
    }
}

async fn data_scope_context(
    db: &PgPool,
    user: &CurrentUser,
) -> Result<DataScopeContext, ApiError> {
    if user.is_sa() {
        return Ok(DataScopeContext::unrestricted());
    }

    let rows = sqlx::query(
        "SELECT scope_type, org_ids, project_scope_type, project_ids
         FROM data_scope_rules
         WHERE role_id = ANY($1)",
    )
    .bind(&user.role_ids)
    .fetch_all(db)
    .await?;

    if rows.is_empty() {
        return Ok(DataScopeContext::unrestricted());
    }

    let mut all_orgs = false;
    let mut all_projects = false;
    let mut org_ids: Vec<Uuid> = Vec::new();
    let mut project_ids: Vec<Uuid> = Vec::new();

    if let Some(person_id) = user.person_id {
        if let Some(primary_org_id) =
            sqlx::query_scalar::<_, Option<Uuid>>("SELECT primary_org_id FROM persons WHERE id = $1")
                .bind(person_id)
                .fetch_optional(db)
                .await?
                .flatten()
        {
            org_ids.push(primary_org_id);
        }
    }

    for row in rows {
        let scope_type: String = row.get("scope_type");
        let rule_org_ids: Vec<Uuid> = row.get("org_ids");
        let project_scope_type: String = row.get("project_scope_type");
        let rule_project_ids: Vec<Uuid> = row.get("project_ids");

        match scope_type.as_str() {
            "center" | "all_center" | "all" => all_orgs = true,
            "department" => {}
            "managed_departments" | "custom" => org_ids.extend(rule_org_ids),
            "self" => {}
            _ => org_ids.extend(rule_org_ids),
        }

        match project_scope_type.as_str() {
            "center" | "all_center" | "all" => all_projects = true,
            "custom" | "specified" => project_ids.extend(rule_project_ids),
            "owner" | "leader" | "responsible" => {
                if let Some(person_id) = user.person_id {
                    let rows = sqlx::query("SELECT id FROM projects WHERE deleted_at IS NULL AND (leader_id = $1 OR managed_by_id = $1)")
                        .bind(person_id)
                        .fetch_all(db)
                        .await?;
                    project_ids.extend(rows.iter().map(|r| r.get::<Uuid, _>("id")));
                }
            }
            "department" => {}
            "member" | "joined" | "participated" => {
                if let Some(person_id) = user.person_id {
                    let rows = sqlx::query(
                        "SELECT p.id
                         FROM projects p
                         WHERE p.deleted_at IS NULL
                           AND (p.leader_id = $1 OR p.managed_by_id = $1 OR EXISTS (
                             SELECT 1 FROM project_members pm
                             WHERE pm.project_id = p.id AND pm.person_id = $1 AND pm.active
                           ))",
                    )
                    .bind(person_id)
                    .fetch_all(db)
                    .await?;
                    project_ids.extend(rows.iter().map(|r| r.get::<Uuid, _>("id")));
                }
            }
            _ => project_ids.extend(rule_project_ids),
        }
    }

    org_ids.sort_unstable();
    org_ids.dedup();
    project_ids.sort_unstable();
    project_ids.dedup();

    Ok(DataScopeContext {
        unrestricted: false,
        all_orgs,
        all_projects,
        org_ids,
        project_ids,
    })
}
