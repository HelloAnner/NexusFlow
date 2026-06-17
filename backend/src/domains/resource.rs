async fn ensure_required_resources(db: &PgPool, task_id: Uuid) -> Result<(), ApiError> {
    let missing = sqlx::query_scalar::<_, i64>(
        "SELECT count(*)
         FROM resource_requirements rr
         WHERE rr.object_type = 'task' AND rr.object_id = $1 AND rr.required
           AND NOT EXISTS (
             SELECT 1 FROM resource_links rl
             JOIN resource_files rf ON rf.id = rl.resource_id
             WHERE rl.object_type = 'task' AND rl.object_id = $1
               AND rf.resource_type = rr.resource_type
               AND rf.status IN ('submitted', 'confirmed', 'archived')
           )",
    )
    .bind(task_id)
    .fetch_one(db)
    .await?;
    if missing > 0 {
        Err(ApiError::conflict(format!(
            "missing {missing} required resource(s)"
        )))
    } else {
        Ok(())
    }
}

async fn list_resources(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
           'id', rf.id,
           'name', rf.name,
           'resource_type', rf.resource_type,
           'uploader_id', rf.uploader_id,
           'visibility', rf.visibility,
           'status', rf.status,
           'current_version_id', rf.current_version_id,
           'is_stage_result', rf.is_stage_result,
           'is_final_result', rf.is_final_result,
           'object_key', rv.object_key,
           'file_size', rv.file_size,
           'content_type', rv.content_type,
           'version_no', rv.version_no,
           'payload', rf.payload,
           'created_at', rf.created_at,
           'updated_at', rf.updated_at
         ) AS item FROM resource_files rf
         LEFT JOIN resource_versions rv ON rv.id = rf.current_version_id
         WHERE rf.deleted_at IS NULL
           AND ($1::text IS NULL OR rf.name ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR rf.status = $2)
           AND (
             $3::uuid IS NULL OR EXISTS (
               SELECT 1 FROM resource_links rl
               WHERE rl.resource_id = rf.id AND rl.object_type = COALESCE($4::text, rl.object_type) AND rl.object_id = $3
             )
           )
         ORDER BY rf.created_at DESC LIMIT $5 OFFSET $6",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
    .bind(query.object_id)
    .bind(query.object_type.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_resource(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let resource = get_json_by_id(&state.db, "resource_files", id).await?;
    let versions = sqlx::query("SELECT to_jsonb(resource_versions.*) AS item FROM resource_versions WHERE resource_id = $1 ORDER BY version_no DESC")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    let links = sqlx::query(
        "SELECT to_jsonb(resource_links.*) AS item FROM resource_links WHERE resource_id = $1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(json!({
        "resource": resource,
        "versions": versions.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "links": links.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?
    })))
}

async fn resource_upload_url(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("resource.upload")?;
    let resource_id = Uuid::new_v4();
    let version_id = Uuid::new_v4();
    let filename = value_str(&payload, "filename", "upload.bin");
    let object_key = format!("resources/default/{resource_id}/{version_id}/{filename}");
    let upload_url = format!(
        "{}/{}",
        state.config.public_url.trim_end_matches('/'),
        object_key
    );
    Ok(Json(json!({
        "resource_id": resource_id,
        "version_id": version_id,
        "object_key": object_key,
        "upload_url": upload_url,
        "method": "PUT",
        "max_mb": state.config.upload_max_mb,
        "s3_configured": state.config.s3_endpoint.is_some() && state.config.s3_bucket.is_some()
    })))
}

async fn resource_complete_upload(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("resource.upload")?;
    let resource_id = value_uuid(&payload, "resource_id").unwrap_or_else(Uuid::new_v4);
    let version_id = value_uuid(&payload, "version_id").unwrap_or_else(Uuid::new_v4);
    let name = value_str(
        &payload,
        "name",
        &value_str(&payload, "filename", "resource"),
    );
    sqlx::query(
        "INSERT INTO resource_files(id, name, resource_type, uploader_id, visibility, status, current_version_id, is_stage_result, is_final_result, payload)
         VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET status = 'submitted', current_version_id = EXCLUDED.current_version_id, updated_at = now(), payload = resource_files.payload || EXCLUDED.payload",
    )
    .bind(resource_id)
    .bind(name.clone())
    .bind(value_str(&payload, "resource_type", "file"))
    .bind(user.person_id)
    .bind(value_str(&payload, "visibility", "normal"))
    .bind(version_id)
    .bind(value_bool(&payload, "is_stage_result", false))
    .bind(value_bool(&payload, "is_final_result", false))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    sqlx::query(
        "INSERT INTO resource_versions(id, resource_id, version_no, object_key, file_size, content_type, sha256, payload)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7)
         ON CONFLICT (resource_id, version_no) DO UPDATE SET object_key = EXCLUDED.object_key, file_size = EXCLUDED.file_size, content_type = EXCLUDED.content_type, sha256 = EXCLUDED.sha256",
    )
    .bind(version_id)
    .bind(resource_id)
    .bind(value_str(&payload, "object_key", ""))
    .bind(value_i64(&payload, "file_size", 0))
    .bind(value_str(&payload, "content_type", "application/octet-stream"))
    .bind(payload.get("sha256").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    if let (Some(object_type), Some(object_id)) = (
        payload.get("object_type").and_then(Value::as_str),
        value_uuid(&payload, "object_id"),
    ) {
        sqlx::query("INSERT INTO resource_links(resource_id, object_type, object_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(resource_id)
            .bind(object_type)
            .bind(object_id)
            .execute(&state.db)
            .await?;
    }
    upsert_search(&state.db, "resource", resource_id, &name).await?;
    emit_event(
        &state.db,
        "resource.uploaded",
        "resource_file",
        Some(resource_id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(
        json!({ "id": resource_id, "version_id": version_id, "status": "submitted" }),
    ))
}

async fn resource_create_version(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("resource.upload")?;
    let status: String = sqlx::query_scalar("SELECT status FROM resource_files WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if status == "archived" && !user.is_sa() {
        return Err(ApiError::conflict("archived resource is version-locked"));
    }
    let next_no: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version_no), 0) + 1 FROM resource_versions WHERE resource_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    let version_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO resource_versions(id, resource_id, version_no, object_key, file_size, content_type, sha256, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(version_id)
    .bind(id)
    .bind(next_no)
    .bind(value_str(&payload, "object_key", ""))
    .bind(value_i64(&payload, "file_size", 0))
    .bind(value_str(&payload, "content_type", "application/octet-stream"))
    .bind(payload.get("sha256").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE resource_files SET current_version_id = $2, updated_at = now(), version = version + 1 WHERE id = $1")
        .bind(id)
        .bind(version_id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "resource.version_created",
        "resource_file",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(
        json!({ "id": id, "version_id": version_id, "version_no": next_no }),
    ))
}

async fn resource_download_url(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("resource.download")?;
    let row = sqlx::query("SELECT rv.object_key, rf.status FROM resource_files rf LEFT JOIN resource_versions rv ON rv.id = rf.current_version_id WHERE rf.id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let object_key: String = row.try_get("object_key").unwrap_or_default();
    let download_url = format!(
        "{}/{}",
        state.config.public_url.trim_end_matches('/'),
        object_key
    );
    audit(
        &state.db,
        user.person_id,
        "resource_file",
        Some(id),
        "resource.download",
        json!({}),
        json!({ "object_key": object_key }),
        "",
        None,
    )
    .await?;
    Ok(Json(
        json!({ "id": id, "download_url": download_url, "expires_in_seconds": 3600 }),
    ))
}

async fn resource_link(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("resource.upload")?;
    let object_type = value_str(&payload, "object_type", "");
    let object_id = value_uuid(&payload, "object_id")
        .ok_or_else(|| ApiError::bad_request("object_id is required"))?;
    sqlx::query("INSERT INTO resource_links(resource_id, object_type, object_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(id)
        .bind(&object_type)
        .bind(object_id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "resource.linked",
        "resource_file",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(
        json!({ "id": id, "object_type": object_type, "object_id": object_id }),
    ))
}

async fn resource_archive(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("resource.upload")?;
    sqlx::query("UPDATE resource_files SET status = 'archived', updated_at = now(), version = version + 1 WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "resource.archived",
        "resource_file",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "archived" })))
}

async fn resource_check_requirements(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let object_type = query
        .get("object_type")
        .cloned()
        .unwrap_or_else(|| "task".to_string());
    let object_id = query
        .get("object_id")
        .and_then(|v| Uuid::parse_str(v).ok())
        .ok_or_else(|| ApiError::bad_request("object_id is required"))?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'resource_type', rr.resource_type,
          'required', rr.required,
          'satisfied', EXISTS (
            SELECT 1 FROM resource_links rl JOIN resource_files rf ON rf.id = rl.resource_id
            WHERE rl.object_type = rr.object_type AND rl.object_id = rr.object_id AND rf.resource_type = rr.resource_type
          )
        ) AS item
         FROM resource_requirements rr
         WHERE rr.object_type = $1 AND rr.object_id = $2",
    )
    .bind(&object_type)
    .bind(object_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "object_type": object_type, "object_id": object_id, "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}
