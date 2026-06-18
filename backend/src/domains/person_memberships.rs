async fn sync_person_org_memberships(
    db: &PgPool,
    person_id: Uuid,
    payload: &Value,
) -> Result<(), ApiError> {
    let primary_org_id = value_uuid(payload, "primary_org_id");
    let has_memberships = payload.get("org_membership_ids").is_some();
    let extra_org_ids = value_uuid_vec(payload, "org_membership_ids");
    if primary_org_id.is_none() && !has_memberships {
        return Ok(());
    }
    if let Some(org_id) = primary_org_id {
        sqlx::query(
            "UPDATE person_org_memberships
             SET active = false, left_at = now()
             WHERE person_id = $1 AND membership_type = 'primary' AND org_id <> $2",
        )
        .bind(person_id)
        .bind(org_id)
        .execute(db)
        .await?;
        sqlx::query(
            "INSERT INTO person_org_memberships(person_id, org_id, membership_type, active, left_at)
             VALUES ($1, $2, 'primary', true, NULL)
             ON CONFLICT (person_id, org_id, membership_type)
             DO UPDATE SET active = true, left_at = NULL",
        )
        .bind(person_id)
        .bind(org_id)
        .execute(db)
        .await?;
    }
    if has_memberships {
        sqlx::query(
            "UPDATE person_org_memberships
             SET active = false, left_at = now()
             WHERE person_id = $1 AND membership_type = 'secondary'",
        )
        .bind(person_id)
        .execute(db)
        .await?;
        for org_id in extra_org_ids {
            if Some(org_id) == primary_org_id {
                continue;
            }
            sqlx::query(
                "INSERT INTO person_org_memberships(person_id, org_id, membership_type, active, left_at)
                 VALUES ($1, $2, 'secondary', true, NULL)
                 ON CONFLICT (person_id, org_id, membership_type)
                 DO UPDATE SET active = true, left_at = NULL",
            )
            .bind(person_id)
            .bind(org_id)
            .execute(db)
            .await?;
        }
    }
    Ok(())
}
