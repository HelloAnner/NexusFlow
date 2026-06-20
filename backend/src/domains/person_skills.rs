async fn sync_person_skill_tags(
    db: &PgPool,
    person_id: Uuid,
    payload: &Value,
) -> Result<(), ApiError> {
    if payload.get("skill_ids").is_none() {
        return Ok(());
    }
    let skill_ids = value_uuid_vec(payload, "skill_ids");
    if !skill_ids.is_empty() {
        let existing: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM skill_tags WHERE enabled = true AND id = ANY($1)",
        )
        .bind(&skill_ids)
        .fetch_one(db)
        .await?;
        if existing != skill_ids.len() as i64 {
            return Err(ApiError::bad_request("skill_ids contains disabled or unknown skill"));
        }
    }
    sqlx::query("DELETE FROM person_skill_tags WHERE person_id = $1")
        .bind(person_id)
        .execute(db)
        .await?;
    for skill_id in skill_ids {
        sqlx::query(
            "INSERT INTO person_skill_tags(person_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(person_id)
        .bind(skill_id)
        .execute(db)
        .await?;
    }
    Ok(())
}

async fn set_user_skills(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if Some(id) != user.person_id {
        user.require_action("person.manage")?;
    }
    let before = person_skill_snapshot(&state.db, id).await?;
    sync_person_skill_tags(&state.db, id, &payload).await?;
    let after = person_skill_snapshot(&state.db, id).await?;
    audit(
        &state.db,
        user.person_id,
        "person",
        Some(id),
        "person.skills.updated",
        before,
        after.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "person.skills.updated",
        "person",
        Some(id),
        user.person_id,
        json!({ "skills": after }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "skills": after })))
}

async fn person_skill_snapshot(db: &PgPool, person_id: Uuid) -> Result<Value, ApiError> {
    let row = sqlx::query(
        "SELECT COALESCE(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) ORDER BY st.name), '[]'::jsonb) AS item
         FROM person_skill_tags pst
         JOIN skill_tags st ON st.id = pst.skill_id
         WHERE pst.person_id = $1",
    )
    .bind(person_id)
    .fetch_one(db)
    .await?;
    Ok(json_row(&row, "item")?)
}
