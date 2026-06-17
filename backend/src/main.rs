use axum::{
    Json, Router,
    body::Body,
    extract::{FromRequestParts, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, Uri, header, request::Parts},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use include_dir::{Dir, include_dir};
use redis::aio::MultiplexedConnection;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use std::{
    collections::{HashMap, HashSet},
    env,
    net::SocketAddr,
    sync::Arc,
};
use tokio::sync::Mutex;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use uuid::Uuid;

static FRONTEND_DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../frontend/dist");

#[derive(Clone)]
struct AppState {
    db: PgPool,
    redis: Option<Arc<Mutex<MultiplexedConnection>>>,
    config: AppConfig,
    started_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
struct AppConfig {
    env: String,
    host: String,
    port: u16,
    public_url: String,
    database_url: String,
    redis_url: Option<String>,
    redis_key_prefix: String,
    s3_endpoint: Option<String>,
    s3_bucket: Option<String>,
    s3_region: String,
    s3_access_key: Option<String>,
    s3_secret_key: Option<String>,
    session_secret: String,
    upload_max_mb: u64,
    search_backend: String,
}

impl AppConfig {
    fn from_env() -> Result<Self, ApiError> {
        dotenvy::dotenv().ok();
        let database_url = env::var("DATABASE_URL").map_err(|_| {
            ApiError::bad_request(
                "DATABASE_URL is required; deploy/test on ssh nexusflow with server components",
            )
        })?;
        Ok(Self {
            env: env::var("APP_ENV").unwrap_or_else(|_| "development".to_string()),
            host: env::var("APP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("APP_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8089),
            public_url: env::var("APP_PUBLIC_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:8089".to_string()),
            database_url,
            redis_url: env::var("REDIS_URL").ok(),
            redis_key_prefix: env::var("REDIS_KEY_PREFIX")
                .unwrap_or_else(|_| "nexusflow:".to_string()),
            s3_endpoint: env::var("S3_ENDPOINT").ok(),
            s3_bucket: env::var("S3_BUCKET").ok(),
            s3_region: env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
            s3_access_key: env::var("S3_ACCESS_KEY").ok(),
            s3_secret_key: env::var("S3_SECRET_KEY").ok(),
            session_secret: env::var("SESSION_SECRET").unwrap_or_else(|_| "change-me".to_string()),
            upload_max_mb: env::var("UPLOAD_MAX_MB")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
            search_backend: env::var("SEARCH_BACKEND").unwrap_or_else(|_| "postgres".to_string()),
        })
    }
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    code: String,
    message: String,
}

#[derive(Debug, thiserror::Error)]
enum ApiError {
    #[error("{message}")]
    BadRequest { message: String },
    #[error("{message}")]
    Unauthorized { message: String },
    #[error("{message}")]
    Forbidden { message: String },
    #[error("{message}")]
    NotFound { message: String },
    #[error("{message}")]
    Conflict { message: String },
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest {
            message: message.into(),
        }
    }
    fn forbidden(message: impl Into<String>) -> Self {
        Self::Forbidden {
            message: message.into(),
        }
    }
    fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound {
            message: message.into(),
        }
    }
    fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict {
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            ApiError::BadRequest { message } => (StatusCode::BAD_REQUEST, "bad_request", message),
            ApiError::Unauthorized { message } => {
                (StatusCode::UNAUTHORIZED, "unauthorized", message)
            }
            ApiError::Forbidden { message } => (StatusCode::FORBIDDEN, "forbidden", message),
            ApiError::NotFound { message } => (StatusCode::NOT_FOUND, "not_found", message),
            ApiError::Conflict { message } => (StatusCode::CONFLICT, "conflict", message),
            ApiError::Sqlx(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "database_error",
                err.to_string(),
            ),
        };
        (
            status,
            Json(ErrorBody {
                code: code.to_string(),
                message,
            }),
        )
            .into_response()
    }
}

#[derive(Clone, Debug, Serialize)]
struct CurrentUser {
    account_id: Uuid,
    person_id: Option<Uuid>,
    login_name: String,
    account_status: String,
    role_ids: Vec<Uuid>,
    role_codes: Vec<String>,
    actions: HashSet<String>,
}

impl CurrentUser {
    fn is_sa(&self) -> bool {
        self.role_codes.iter().any(|r| r == "sa")
    }
    fn is_pending(&self) -> bool {
        self.account_status == "pending" || self.role_codes.iter().any(|r| r == "pending")
    }
    fn require_action(&self, action: &str) -> Result<(), ApiError> {
        if self.is_sa() || self.actions.contains(action) {
            Ok(())
        } else {
            Err(ApiError::forbidden(format!(
                "missing permission action: {action}"
            )))
        }
    }
    fn require_business_access(&self) -> Result<(), ApiError> {
        if self.is_pending() {
            Err(ApiError::forbidden(
                "pending account cannot access business data",
            ))
        } else {
            Ok(())
        }
    }
}

impl FromRequestParts<Arc<AppState>> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "))
            .map(str::to_string);
        let account_id_header = parts
            .headers
            .get("x-account-id")
            .and_then(|h| h.to_str().ok())
            .and_then(|v| Uuid::parse_str(v).ok());

        let account_id = if let Some(token) = token {
            let token_hash = hash_token(&state.config.session_secret, &token);
            sqlx::query_scalar::<_, Uuid>(
                "SELECT account_id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
            )
            .bind(token_hash)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| ApiError::Unauthorized { message: "invalid or expired session".to_string() })?
        } else if let Some(account_id) = account_id_header {
            account_id
        } else {
            return Err(ApiError::Unauthorized {
                message: "missing bearer token".to_string(),
            });
        };

        load_current_user(&state.db, account_id).await
    }
}

#[derive(Deserialize)]
struct PageQuery {
    q: Option<String>,
    status: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
}

impl PageQuery {
    fn limit(&self) -> i64 {
        self.page_size.unwrap_or(50).clamp(1, 200)
    }
    fn offset(&self) -> i64 {
        (self.page.unwrap_or(1).max(1) - 1) * self.limit()
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("nexusflow_backend=info".parse()?),
        )
        .json()
        .init();

    let config = AppConfig::from_env().map_err(|err| anyhow::anyhow!(err.to_string()))?;
    let db = PgPoolOptions::new()
        .max_connections(
            env::var("DATABASE_MAX_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(20),
        )
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    bootstrap(&db).await?;

    let redis = if let Some(url) = &config.redis_url {
        match redis::Client::open(url.as_str()) {
            Ok(client) => match client.get_multiplexed_tokio_connection().await {
                Ok(conn) => Some(Arc::new(Mutex::new(conn))),
                Err(err) => {
                    if config.env == "production" {
                        return Err(anyhow::anyhow!(
                            "REDIS_URL is set but cannot connect: {err}"
                        ));
                    }
                    tracing::warn!(error = %err, "redis unavailable, continuing in non-production mode");
                    None
                }
            },
            Err(err) => return Err(anyhow::anyhow!("invalid REDIS_URL: {err}")),
        }
    } else if config.env == "production" {
        return Err(anyhow::anyhow!("REDIS_URL is required in production"));
    } else {
        None
    };

    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    let state = Arc::new(AppState {
        db,
        redis,
        config,
        started_at: Utc::now(),
    });
    let app = app(state);
    tracing::info!(%addr, "nexusflow backend listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .nest("/api", api_routes())
        .fallback(static_assets)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn static_assets(uri: Uri) -> Result<Response, ApiError> {
    let path = uri.path().trim_start_matches('/');
    if path.starts_with("api/") {
        return Err(ApiError::not_found("api route not found"));
    }

    let requested = if path.is_empty() { "index.html" } else { path };
    let file = FRONTEND_DIST
        .get_file(requested)
        .or_else(|| FRONTEND_DIST.get_file("index.html"))
        .ok_or_else(|| ApiError::not_found("frontend assets are not embedded"))?;

    let mime = mime_guess::from_path(file.path()).first_or_octet_stream();
    let mut response = Response::new(Body::from(file.contents().to_vec()));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(mime.as_ref())
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    Ok(response)
}

fn api_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(auth_me))
        .route("/orgs/tree", get(org_tree))
        .route("/orgs", get(list_orgs).post(create_org))
        .route("/orgs/{id}", patch(update_org))
        .route("/orgs/{id}/disable", post(disable_org))
        .route("/users", get(list_users).post(create_user))
        .route("/users/{id}", get(get_user).patch(update_user))
        .route("/users/{id}/disable", post(disable_user))
        .route("/users/{id}/workload-summary", get(user_workload_summary))
        .route("/skills", get(list_skills).post(create_skill))
        .route("/skills/{id}", patch(update_skill))
        .route("/skills/{id}/disable", post(disable_skill))
        .route("/roles", get(list_roles).post(create_role))
        .route("/roles/{id}", patch(update_role))
        .route(
            "/roles/{id}/actions",
            get(role_actions).put(set_role_actions),
        )
        .route("/permissions/me", get(permissions_me))
        .route("/permissions/check", post(permission_check))
        .route(
            "/visibility-grants",
            get(list_visibility_grants).post(create_visibility_grant),
        )
        .route("/visibility-grants/{id}", delete(delete_visibility_grant))
        .route("/audit/permission", get(list_audit))
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{id}", get(get_project).patch(update_project))
        .route("/projects/{id}/members", post(add_project_member))
        .route(
            "/projects/{id}/members/{person_id}",
            patch(update_project_member).delete(delete_project_member),
        )
        .route(
            "/projects/{id}/visibility-grants",
            post(project_visibility_grant),
        )
        .route("/projects/{id}/archive", post(archive_project))
        .route("/projects/{id}/stats", get(project_stats))
        .route("/tasks", get(list_tasks).post(create_task))
        .route("/tasks/{id}", get(get_task).patch(update_task))
        .route("/tasks/{id}/submit", post(submit_task))
        .route("/tasks/{id}/confirm", post(confirm_task))
        .route("/tasks/{id}/start", post(start_task))
        .route("/tasks/{id}/pause", post(pause_task))
        .route("/tasks/{id}/cancel", post(cancel_task))
        .route("/tasks/{id}/submit-acceptance", post(submit_acceptance))
        .route("/tasks/{id}/accept", post(accept_task))
        .route("/tasks/{id}/reject", post(reject_task))
        .route("/tasks/{id}/archive", post(archive_task))
        .route("/tasks/{id}/assignments", post(create_assignment))
        .route("/assignments/{id}", patch(update_assignment))
        .route("/assignments/{id}/progress", post(assignment_progress))
        .route(
            "/assignments/{id}/submit-result",
            post(assignment_submit_result),
        )
        .route("/dispatch/preview", post(dispatch_preview))
        .route("/dispatch/submit", post(dispatch_submit))
        .route("/approvals", get(list_approvals))
        .route("/approvals/{id}", get(get_approval))
        .route("/approvals/{id}/approve", post(approval_approve))
        .route("/approvals/{id}/reject", post(approval_reject))
        .route("/approvals/{id}/adjust", post(approval_adjust))
        .route("/approvals/{id}/escalate", post(approval_escalate))
        .route(
            "/approvals/{id}/meeting-records",
            post(create_meeting_record),
        )
        .route("/workload/preview", post(workload_preview))
        .route("/workload/person/{person_id}", get(workload_person))
        .route("/workload/calendar", get(workload_calendar))
        .route("/conflicts", get(list_conflicts))
        .route("/conflicts/{id}", get(get_conflict))
        .route("/conflicts/{id}/resolve", post(resolve_conflict))
        .route("/conflicts/{id}/force", post(force_conflict))
        .route("/conflicts/recalculate", post(recalculate_conflicts))
        .route("/resources", get(list_resources))
        .route("/resources/{id}", get(get_resource))
        .route("/resources/upload-url", post(resource_upload_url))
        .route("/resources/complete-upload", post(resource_complete_upload))
        .route("/resources/{id}/versions", post(resource_create_version))
        .route("/resources/{id}/download-url", get(resource_download_url))
        .route("/resources/{id}/link", post(resource_link))
        .route("/resources/{id}/archive", post(resource_archive))
        .route(
            "/resources/check-requirements",
            get(resource_check_requirements),
        )
        .route("/dashboard", get(dashboard))
        .route("/dashboard/widgets", get(dashboard_widgets))
        .route("/dashboard/role-entry", get(dashboard_role_entry))
        .route("/dashboard/role-view", post(dashboard_role_view))
        .route("/dashboard/recent-activities", get(recent_activities))
        .route("/config/modules", get(config_modules))
        .route("/config/versions", get(config_versions))
        .route("/config/runtime-status", get(runtime_status))
        .route("/config/{namespace}", get(get_config))
        .route("/config/{namespace}/draft", post(save_config_draft))
        .route("/config/{namespace}/publish", post(publish_config))
        .route("/config/{namespace}/disable", post(disable_config))
        .route("/todos", get(list_todos))
        .route("/todos/{id}/complete", post(complete_todo))
        .route("/notifications", get(list_notifications))
        .route("/notifications/{id}/read", post(read_notification))
        .route("/reports", get(list_reports))
        .route("/reports/{report_type}", get(get_report))
        .route("/reports/{report_type}/export", post(export_report))
        .route("/tools", get(list_tools).post(create_tool))
        .route("/tools/{id}", get(get_tool).patch(update_tool))
        .route("/tools/{id}/context", post(tool_context))
        .route("/tools/{id}/usage", get(tool_usage).post(record_tool_usage))
        .route("/gantt", get(gantt))
        .route("/gantt/summary", get(gantt_summary))
        .route("/search", get(search))
        .route("/search/suggest", get(search_suggest))
        .route(
            "/saved-filters",
            get(list_saved_filters).post(create_saved_filter),
        )
        .route(
            "/invitations/templates",
            get(list_invitation_templates).post(create_invitation_template),
        )
        .route(
            "/invitations/templates/{id}",
            patch(update_invitation_template),
        )
        .route(
            "/invitations/templates/{id}/links",
            post(create_invitation_link),
        )
        .route("/invitations/links", get(list_invitation_links))
        .route(
            "/invitations/links/{id}/disable",
            post(disable_invitation_link),
        )
        .route(
            "/register/invitation/{token}",
            get(get_invitation_token).post(register_by_invitation),
        )
        .route("/admin/registrations", get(list_registrations))
        .route(
            "/admin/registrations/{id}/approve",
            post(approve_registration),
        )
        .route(
            "/admin/registrations/{id}/reject",
            post(reject_registration),
        )
        .route("/admin/dashboard", get(admin_dashboard))
        .route("/admin/accounts", get(list_accounts))
        .route("/admin/accounts/{id}/disable", post(disable_account))
        .route("/admin/accounts/{id}/unlock", post(unlock_account))
}

async fn healthz() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn readyz(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ApiError> {
    let db_ok = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();
    let redis_ok = if let Some(conn) = &state.redis {
        let mut conn = conn.lock().await;
        redis::cmd("PING")
            .query_async::<String>(&mut *conn)
            .await
            .is_ok()
    } else {
        false
    };
    let s3_ok = state.config.s3_endpoint.is_some() && state.config.s3_bucket.is_some();
    Ok(Json(json!({
        "status": if db_ok && (state.config.env != "production" || redis_ok) { "ready" } else { "degraded" },
        "database": db_ok,
        "redis": redis_ok,
        "redis_key_prefix": state.config.redis_key_prefix,
        "s3_configured": s3_ok,
        "s3_region": state.config.s3_region,
        "s3_credentials_configured": state.config.s3_access_key.is_some() && state.config.s3_secret_key.is_some(),
        "port": state.config.port,
        "search_backend": state.config.search_backend,
        "uptime_seconds": (Utc::now() - state.started_at).num_seconds()
    })))
}

async fn bootstrap(db: &PgPool) -> Result<(), sqlx::Error> {
    let sa_role_id: Uuid = sqlx::query_scalar("SELECT id FROM roles WHERE code = 'sa'")
        .fetch_one(db)
        .await?;
    let org_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO organizations(name, code, org_type, path)
         VALUES ('NexusFlow', 'ROOT', 'company', '/ROOT')
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id",
    )
    .fetch_one(db)
    .await?;

    let account_id = if let Some(id) =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM accounts WHERE login_name = 'Anner'")
            .fetch_optional(db)
            .await?
    {
        id
    } else {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO accounts(login_name, password_hash, status)
             VALUES ('Anner', $1, 'enabled') RETURNING id",
        )
        .bind(hash_password("1"))
        .fetch_one(db)
        .await?
    };

    let person_id = if let Some(id) =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM persons WHERE account_id = $1")
            .bind(account_id)
            .fetch_optional(db)
            .await?
    {
        id
    } else {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO persons(name, account_id, primary_org_id, system_role_ids, work_status, account_status, dispatch_enabled)
             VALUES ('Anner', $1, $2, $3, 'active', 'enabled', true) RETURNING id",
        )
        .bind(account_id)
        .bind(org_id)
        .bind(vec![sa_role_id])
        .fetch_one(db)
        .await?
    };

    sqlx::query("UPDATE accounts SET person_id = $1, status = 'enabled' WHERE id = $2")
        .bind(person_id)
        .bind(account_id)
        .execute(db)
        .await?;
    Ok(())
}

async fn load_current_user(db: &PgPool, account_id: Uuid) -> Result<CurrentUser, ApiError> {
    let row = sqlx::query(
        "SELECT a.id, a.login_name, a.status, a.person_id, COALESCE(p.system_role_ids, '{}') AS role_ids
         FROM accounts a
         LEFT JOIN persons p ON p.id = a.person_id
         WHERE a.id = $1 AND a.deleted_at IS NULL",
    )
    .bind(account_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| ApiError::Unauthorized { message: "account not found".to_string() })?;

    let role_ids: Vec<Uuid> = row.try_get("role_ids")?;
    let mut role_codes = Vec::new();
    let mut actions = HashSet::new();
    if !role_ids.is_empty() {
        let rows = sqlx::query("SELECT id, code FROM roles WHERE id = ANY($1) AND enabled = true")
            .bind(&role_ids)
            .fetch_all(db)
            .await?;
        let enabled_role_ids: Vec<Uuid> = rows.iter().map(|r| r.get("id")).collect();
        role_codes = rows.iter().map(|r| r.get::<String, _>("code")).collect();
        if !enabled_role_ids.is_empty() {
            for row in sqlx::query("SELECT action_code FROM role_actions WHERE role_id = ANY($1)")
                .bind(&enabled_role_ids)
                .fetch_all(db)
                .await?
            {
                actions.insert(row.get::<String, _>("action_code"));
            }
        }
    }

    Ok(CurrentUser {
        account_id: row.get("id"),
        person_id: row.try_get("person_id").ok(),
        login_name: row.get("login_name"),
        account_status: row.get("status"),
        role_ids,
        role_codes,
        actions,
    })
}

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"nexusflow-password-v1:");
    hasher.update(password.as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

fn verify_password(raw: &str, stored: &str) -> bool {
    if let Some(plain) = stored.strip_prefix("plain:") {
        raw == plain
    } else {
        hash_password(raw) == stored
    }
}

fn random_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn hash_token(secret: &str, token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hasher.update(b":");
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn value_str(payload: &Value, key: &str, default: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(default)
        .to_string()
}

fn value_uuid(payload: &Value, key: &str) -> Option<Uuid> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .and_then(|v| Uuid::parse_str(v).ok())
}

fn value_uuid_vec(payload: &Value, key: &str) -> Vec<Uuid> {
    payload
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .filter_map(|v| Uuid::parse_str(v).ok())
                .collect()
        })
        .unwrap_or_default()
}

fn value_bool(payload: &Value, key: &str, default: bool) -> bool {
    payload.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn value_f64(payload: &Value, key: &str, default: f64) -> f64 {
    payload.get(key).and_then(Value::as_f64).unwrap_or(default)
}

fn value_i64(payload: &Value, key: &str, default: i64) -> i64 {
    payload.get(key).and_then(Value::as_i64).unwrap_or(default)
}

fn parse_date(payload: &Value, key: &str) -> Option<NaiveDate> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
}

fn parse_datetime(payload: &Value, key: &str) -> Option<DateTime<Utc>> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc))
}

fn json_row(row: &sqlx::postgres::PgRow, alias: &str) -> Result<Value, sqlx::Error> {
    row.try_get::<Value, _>(alias)
}

async fn emit_event(
    db: &PgPool,
    event_type: &str,
    object_type: &str,
    object_id: Option<Uuid>,
    actor_id: Option<Uuid>,
    payload: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO domain_events(event_type, object_type, object_id, actor_id, payload)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(event_type)
    .bind(object_type)
    .bind(object_id)
    .bind(actor_id)
    .bind(payload)
    .execute(db)
    .await?;
    Ok(())
}

async fn audit(
    db: &PgPool,
    actor_id: Option<Uuid>,
    object_type: &str,
    object_id: Option<Uuid>,
    action: &str,
    before_payload: Value,
    after_payload: Value,
    reason: &str,
    headers: Option<&HeaderMap>,
) -> Result<(), sqlx::Error> {
    let request_id = headers
        .and_then(|h| h.get("x-request-id"))
        .and_then(|h| h.to_str().ok())
        .map(str::to_string);
    let source_ip = headers
        .and_then(|h| h.get("x-forwarded-for"))
        .and_then(|h| h.to_str().ok())
        .map(str::to_string);
    sqlx::query(
        "INSERT INTO audit_logs(actor_id, object_type, object_id, action, before_payload, after_payload, reason, request_id, source_ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(actor_id)
    .bind(object_type)
    .bind(object_id)
    .bind(action)
    .bind(before_payload)
    .bind(after_payload)
    .bind(reason)
    .bind(request_id)
    .bind(source_ip)
    .execute(db)
    .await?;
    Ok(())
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let login_name = value_str(&payload, "login_name", "");
    let password = value_str(&payload, "password", "");
    if login_name.is_empty() || password.is_empty() {
        return Err(ApiError::bad_request(
            "login_name and password are required",
        ));
    }
    let row = sqlx::query("SELECT id, password_hash, status, failed_login_count FROM accounts WHERE login_name = $1 AND deleted_at IS NULL")
        .bind(&login_name)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::Unauthorized { message: "invalid credentials".to_string() })?;
    let account_id: Uuid = row.get("id");
    let status: String = row.get("status");
    if status == "disabled" || status == "locked" {
        return Err(ApiError::forbidden("account is disabled or locked"));
    }
    let password_hash: String = row.get("password_hash");
    if !verify_password(&password, &password_hash) {
        let failed: i32 = row.get("failed_login_count");
        let new_failed = failed + 1;
        let new_status = if new_failed >= 5 { "locked" } else { &status };
        sqlx::query("UPDATE accounts SET failed_login_count = $1, status = $2, updated_at = now() WHERE id = $3")
            .bind(new_failed)
            .bind(new_status)
            .bind(account_id)
            .execute(&state.db)
            .await?;
        return Err(ApiError::Unauthorized {
            message: "invalid credentials".to_string(),
        });
    }

    let token = random_token();
    let token_hash = hash_token(&state.config.session_secret, &token);
    let expires_at = Utc::now() + Duration::days(7);
    sqlx::query("INSERT INTO sessions(account_id, token_hash, expires_at) VALUES ($1, $2, $3)")
        .bind(account_id)
        .bind(token_hash)
        .bind(expires_at)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE accounts SET last_login_at = now(), failed_login_count = 0, updated_at = now() WHERE id = $1")
        .bind(account_id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "auth.login",
        "account",
        Some(account_id),
        None,
        json!({ "login_name": login_name }),
    )
    .await?;
    let user = load_current_user(&state.db, account_id).await?;
    Ok(Json(
        json!({ "token": token, "expires_at": expires_at, "user": user }),
    ))
}

async fn logout(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    sqlx::query(
        "UPDATE sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
    )
    .bind(user.account_id)
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "auth.logout",
        "account",
        Some(user.account_id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn auth_me(user: CurrentUser) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "user": user })))
}

async fn permissions_me(user: CurrentUser) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({
        "account_id": user.account_id,
        "person_id": user.person_id,
        "roles": user.role_codes,
        "actions": user.actions,
        "pending": user.is_pending()
    })))
}

async fn permission_check(
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let action = value_str(&payload, "action", "");
    let allowed = user.is_sa() || user.actions.contains(&action);
    Ok(Json(json!({ "allowed": allowed, "action": action })))
}

async fn org_tree(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', id, 'name', name, 'code', code, 'org_type', org_type, 'parent_id', parent_id,
          'path', path, 'leader_ids', leader_ids, 'enabled', enabled, 'payload', payload
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
        "SELECT jsonb_build_object('id', id, 'name', name, 'code', code, 'org_type', org_type, 'parent_id', parent_id, 'path', path, 'enabled', enabled, 'payload', payload) AS item
         FROM organizations
         WHERE deleted_at IS NULL AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR code ILIKE '%' || $1 || '%')
         ORDER BY path, name LIMIT $2 OFFSET $3",
    )
    .bind(query.q.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
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
          org_type = COALESCE($3, org_type),
          leader_ids = COALESCE($4, leader_ids),
          deputy_leader_ids = COALESCE($5, deputy_leader_ids),
          technical_supervisor_ids = COALESCE($6, technical_supervisor_ids),
          default_approver_ids = COALESCE($7, default_approver_ids),
          payload = payload || $8,
          updated_at = now(),
          version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
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
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
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
          'primary_org_id', p.primary_org_id, 'work_status', p.work_status, 'daily_standard_hours', p.daily_standard_hours,
          'dispatch_enabled', p.dispatch_enabled, 'account_status', p.account_status, 'system_role_ids', p.system_role_ids,
          'payload', p.payload
        ) AS item
         FROM persons p
         WHERE p.deleted_at IS NULL
           AND ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.employee_no ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR p.work_status = $2)
         ORDER BY p.created_at DESC LIMIT $3 OFFSET $4",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
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

async fn list_skills(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(skill_tags.*) AS item FROM skill_tags ORDER BY name")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_skill(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO skill_tags(name, enabled, payload) VALUES ($1, true, $2) RETURNING id",
    )
    .bind(value_str(&payload, "name", ""))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    emit_event(
        &state.db,
        "person.skill_changed",
        "skill_tag",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_skill(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    sqlx::query(
        "UPDATE skill_tags SET name = COALESCE($2, name), payload = payload || $3 WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "person.skill_changed",
        "skill_tag",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn disable_skill(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("person.manage")?;
    sqlx::query("UPDATE skill_tags SET enabled = false WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "enabled": false })))
}

async fn list_roles(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(roles.*) AS item FROM roles ORDER BY priority, code")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_role(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO roles(code, name, role_type, priority, enabled, payload) VALUES ($1,$2,$3,$4,true,$5) RETURNING id",
    )
    .bind(value_str(&payload, "code", ""))
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "role_type", "employee"))
    .bind(value_i64(&payload, "priority", 100) as i32)
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "role",
        Some(id),
        "role.created",
        json!({}),
        payload.clone(),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_role(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let before = get_json_by_id(&state.db, "roles", id).await?;
    sqlx::query(
        "UPDATE roles SET name = COALESCE($2, name), role_type = COALESCE($3, role_type), priority = COALESCE($4, priority), enabled = COALESCE($5, enabled), payload = payload || $6 WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("role_type").and_then(Value::as_str))
    .bind(payload.get("priority").and_then(Value::as_i64).map(|v| v as i32))
    .bind(payload.get("enabled").and_then(Value::as_bool))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "role",
        Some(id),
        "role.updated",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn role_actions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows =
        sqlx::query("SELECT action_code FROM role_actions WHERE role_id = $1 ORDER BY action_code")
            .bind(id)
            .fetch_all(&state.db)
            .await?;
    Ok(Json(
        json!({ "role_id": id, "actions": rows.iter().map(|r| r.get::<String, _>("action_code")).collect::<Vec<_>>() }),
    ))
}

async fn set_role_actions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let actions: Vec<String> = payload
        .get("actions")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let mut tx = state.db.begin().await?;
    sqlx::query("DELETE FROM role_actions WHERE role_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for action in &actions {
        sqlx::query("INSERT INTO role_actions(role_id, action_code) VALUES ($1, $2)")
            .bind(id)
            .bind(action)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    audit(
        &state.db,
        user.person_id,
        "role",
        Some(id),
        "role.actions_updated",
        json!({}),
        json!({ "actions": actions }),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "role_id": id, "actions": actions })))
}

async fn list_visibility_grants(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(visibility_grants.*) AS item FROM visibility_grants ORDER BY created_at DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_visibility_grant(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO visibility_grants(object_type, object_id, subject_type, subject_id, grant_actions, expires_at, created_by, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(value_str(&payload, "object_type", "project"))
    .bind(value_uuid(&payload, "object_id").ok_or_else(|| ApiError::bad_request("object_id is required"))?)
    .bind(value_str(&payload, "subject_type", "person"))
    .bind(value_uuid(&payload, "subject_id").ok_or_else(|| ApiError::bad_request("subject_id is required"))?)
    .bind(payload.get("grant_actions").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect::<Vec<_>>()).unwrap_or_default())
    .bind(parse_datetime(&payload, "expires_at"))
    .bind(user.person_id)
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "visibility_grant",
        Some(id),
        "visibility_grant.created",
        json!({}),
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "project.visibility_changed",
        "visibility_grant",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn delete_visibility_grant(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let before = get_json_by_id(&state.db, "visibility_grants", id)
        .await
        .unwrap_or_else(|_| json!({}));
    sqlx::query("DELETE FROM visibility_grants WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    audit(
        &state.db,
        user.person_id,
        "visibility_grant",
        Some(id),
        "visibility_grant.deleted",
        before,
        json!({}),
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id, "deleted": true })))
}

async fn list_audit(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let rows = sqlx::query(
        "SELECT to_jsonb(audit_logs.*) AS item FROM audit_logs
         WHERE ($1::text IS NULL OR action ILIKE '%' || $1 || '%' OR object_type ILIKE '%' || $1 || '%')
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(query.q.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn list_projects(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(p.*) AS item
         FROM projects p
         WHERE p.deleted_at IS NULL
           AND ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.project_no ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR p.status = $2)
           AND (
             $3::bool OR p.visibility = 'normal' OR p.leader_id = $4 OR EXISTS (
               SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $4 AND pm.active
             ) OR EXISTS (
               SELECT 1 FROM visibility_grants vg WHERE vg.object_type = 'project' AND vg.object_id = p.id
                 AND ((vg.subject_type = 'person' AND vg.subject_id = $4) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($5)))
                 AND (vg.expires_at IS NULL OR vg.expires_at > now())
             )
           )
         ORDER BY p.created_at DESC LIMIT $6 OFFSET $7",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_visible(&state.db, &user, id).await?;
    Ok(Json(get_json_by_id(&state.db, "projects", id).await?))
}

async fn create_project(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("project.create")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO projects(project_no, name, project_type, level, owner_org_id, leader_id, managed_by_id, status, visibility, start_date, end_date, summary, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
    )
    .bind(value_str(&payload, "project_no", &format!("PRJ-{}", Utc::now().timestamp_millis())))
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "project_type", "other"))
    .bind(value_str(&payload, "level", "custom"))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "leader_id").or(user.person_id))
    .bind(value_uuid(&payload, "managed_by_id"))
    .bind(value_str(&payload, "status", "preparing"))
    .bind(value_str(&payload, "visibility", "normal"))
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "end_date"))
    .bind(value_str(&payload, "summary", ""))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    if let Some(pid) = user.person_id {
        sqlx::query("INSERT INTO project_members(project_id, person_id, project_role, work_desc) VALUES ($1,$2,'leader','项目负责人') ON CONFLICT DO NOTHING")
            .bind(id)
            .bind(pid)
            .execute(&state.db)
            .await?;
    }
    upsert_search(
        &state.db,
        "project",
        id,
        &format!(
            "{} {}",
            value_str(&payload, "project_no", ""),
            value_str(&payload, "name", "")
        ),
    )
    .await?;
    emit_event(
        &state.db,
        "project.created",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    let before = get_json_by_id(&state.db, "projects", id).await?;
    sqlx::query(
        "UPDATE projects SET
          name = COALESCE($2, name),
          project_type = COALESCE($3, project_type),
          level = COALESCE($4, level),
          owner_org_id = COALESCE($5, owner_org_id),
          leader_id = COALESCE($6, leader_id),
          managed_by_id = COALESCE($7, managed_by_id),
          status = COALESCE($8, status),
          visibility = COALESCE($9, visibility),
          start_date = COALESCE($10, start_date),
          end_date = COALESCE($11, end_date),
          summary = COALESCE($12, summary),
          payload = payload || $13,
          updated_at = now(),
          version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("project_type").and_then(Value::as_str))
    .bind(payload.get("level").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "leader_id"))
    .bind(value_uuid(&payload, "managed_by_id"))
    .bind(payload.get("status").and_then(Value::as_str))
    .bind(payload.get("visibility").and_then(Value::as_str))
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "end_date"))
    .bind(payload.get("summary").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "project",
        Some(id),
        "project.updated",
        before,
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "project.updated",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn add_project_member(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    let person_id = value_uuid(&payload, "person_id")
        .ok_or_else(|| ApiError::bad_request("person_id is required"))?;
    sqlx::query(
        "INSERT INTO project_members(project_id, person_id, project_role, work_desc, org_snapshot, active)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (project_id, person_id) DO UPDATE
         SET project_role = EXCLUDED.project_role, work_desc = EXCLUDED.work_desc, active = true, left_at = NULL",
    )
    .bind(id)
    .bind(person_id)
    .bind(value_str(&payload, "project_role", "member"))
    .bind(value_str(&payload, "work_desc", ""))
    .bind(payload.get("org_snapshot").cloned().unwrap_or_else(|| json!({})))
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "project.member_changed",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "project_id": id, "person_id": person_id })))
}

async fn update_project_member(
    State(state): State<Arc<AppState>>,
    Path((id, person_id)): Path<(Uuid, Uuid)>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    sqlx::query("UPDATE project_members SET project_role = COALESCE($3, project_role), work_desc = COALESCE($4, work_desc), active = COALESCE($5, active) WHERE project_id = $1 AND person_id = $2")
        .bind(id)
        .bind(person_id)
        .bind(payload.get("project_role").and_then(Value::as_str))
        .bind(payload.get("work_desc").and_then(Value::as_str))
        .bind(payload.get("active").and_then(Value::as_bool))
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "project.member_changed",
        "project",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "project_id": id, "person_id": person_id })))
}

async fn delete_project_member(
    State(state): State<Arc<AppState>>,
    Path((id, person_id)): Path<(Uuid, Uuid)>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    sqlx::query("UPDATE project_members SET active = false, left_at = now() WHERE project_id = $1 AND person_id = $2")
        .bind(id)
        .bind(person_id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "project.member_changed",
        "project",
        Some(id),
        user.person_id,
        json!({ "person_id": person_id, "active": false }),
    )
    .await?;
    Ok(Json(
        json!({ "project_id": id, "person_id": person_id, "active": false }),
    ))
}

async fn project_visibility_grant(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(mut payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    payload["object_type"] = json!("project");
    payload["object_id"] = json!(id);
    create_visibility_grant(State(state), user, Json(payload)).await
}

async fn archive_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_manageable(&state.db, &user, id).await?;
    sqlx::query("UPDATE projects SET status = 'archived', updated_at = now(), version = version + 1 WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "project.archived",
        "project",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "archived" })))
}

async fn project_stats(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_project_visible(&state.db, &user, id).await?;
    let row = sqlx::query(
        "SELECT
          (SELECT count(*) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL) AS task_count,
          (SELECT count(*) FROM project_members WHERE project_id = $1 AND active) AS member_count,
          (SELECT count(*) FROM resource_links WHERE object_type = 'project' AND object_id = $1) AS resource_count",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "project_id": id,
        "task_count": row.get::<i64, _>("task_count"),
        "member_count": row.get::<i64, _>("member_count"),
        "resource_count": row.get::<i64, _>("resource_count")
    })))
}

async fn ensure_project_visible(
    db: &PgPool,
    user: &CurrentUser,
    project_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() {
        return Ok(());
    }
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = $1 AND p.deleted_at IS NULL AND (
            p.visibility = 'normal' OR p.leader_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $2 AND pm.active
            ) OR EXISTS (
              SELECT 1 FROM visibility_grants vg WHERE vg.object_type = 'project' AND vg.object_id = p.id
                AND ((vg.subject_type = 'person' AND vg.subject_id = $2) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($3)))
                AND (vg.expires_at IS NULL OR vg.expires_at > now())
            )
          )
        )",
    )
    .bind(project_id)
    .bind(user.person_id)
    .bind(&user.role_ids)
    .fetch_one(db)
    .await?;
    if visible {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "project is hidden or out of data scope",
        ))
    }
}

async fn ensure_project_manageable(
    db: &PgPool,
    user: &CurrentUser,
    project_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() || user.actions.contains("project.manage") {
        return Ok(());
    }
    let manageable = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND leader_id = $2)",
    )
    .bind(project_id)
    .bind(user.person_id)
    .fetch_one(db)
    .await?;
    if manageable {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "project is not manageable by current user",
        ))
    }
}

async fn ensure_task_visible(
    db: &PgPool,
    user: &CurrentUser,
    task_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() {
        return Ok(());
    }
    let visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
          SELECT 1 FROM tasks t
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.id = $1 AND t.deleted_at IS NULL AND (
            t.visibility = 'normal' OR t.initiator_id = $2 OR t.owner_id = $2 OR t.acceptor_id = $2 OR EXISTS (
              SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $2
            ) OR EXISTS (
              SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $2 OR $2 = ANY(ta.collaborator_ids))
            ) OR p.visibility = 'normal' OR p.leader_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $2 AND pm.active
            ) OR EXISTS (
              SELECT 1 FROM visibility_grants vg WHERE vg.object_type IN ('task','project') AND vg.object_id IN (t.id, t.project_id)
                AND ((vg.subject_type = 'person' AND vg.subject_id = $2) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($3)))
                AND (vg.expires_at IS NULL OR vg.expires_at > now())
            )
          )
        )",
    )
    .bind(task_id)
    .bind(user.person_id)
    .bind(&user.role_ids)
    .fetch_one(db)
    .await?;
    if visible {
        Ok(())
    } else {
        Err(ApiError::forbidden("task is hidden or out of data scope"))
    }
}

async fn ensure_task_editable(
    db: &PgPool,
    user: &CurrentUser,
    task_id: Uuid,
) -> Result<(), ApiError> {
    if user.is_sa() || user.actions.contains("task.dispatch") {
        return Ok(());
    }
    let editable = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1 AND (initiator_id = $2 OR owner_id = $2) AND status <> 'archived')")
        .bind(task_id)
        .bind(user.person_id)
        .fetch_one(db)
        .await?;
    if editable {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "task is not editable by current user or already archived",
        ))
    }
}

async fn upsert_search(
    db: &PgPool,
    object_type: &str,
    object_id: Uuid,
    text: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO search_index_meta(object_type, object_id, search_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (object_type, object_id) DO UPDATE SET search_text = EXCLUDED.search_text, updated_at = now()",
    )
    .bind(object_type)
    .bind(object_id)
    .bind(text)
    .execute(db)
    .await?;
    Ok(())
}

async fn list_tasks(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(t.*) AS item
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL
           AND ($1::text IS NULL OR t.name ILIKE '%' || $1 || '%' OR t.task_no ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR t.status = $2)
           AND (
             $3::bool OR t.visibility = 'normal' OR t.initiator_id = $4 OR t.owner_id = $4 OR t.acceptor_id = $4
             OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4)
             OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND (ta.owner_id = $4 OR $4 = ANY(ta.collaborator_ids)))
             OR p.visibility = 'normal' OR p.leader_id = $4
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.person_id = $4 AND pm.active)
             OR EXISTS (
               SELECT 1 FROM visibility_grants vg WHERE vg.object_type IN ('task','project') AND vg.object_id IN (t.id, t.project_id)
                 AND ((vg.subject_type = 'person' AND vg.subject_id = $4) OR (vg.subject_type = 'role' AND vg.subject_id = ANY($5)))
                 AND (vg.expires_at IS NULL OR vg.expires_at > now())
             )
           )
         ORDER BY t.created_at DESC LIMIT $6 OFFSET $7",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(&user.role_ids)
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    ensure_task_visible(&state.db, &user, id).await?;
    let task = get_json_by_id(&state.db, "tasks", id).await?;
    let members =
        sqlx::query("SELECT to_jsonb(task_members.*) AS item FROM task_members WHERE task_id = $1")
            .bind(id)
            .fetch_all(&state.db)
            .await?;
    let assignments = sqlx::query("SELECT to_jsonb(task_assignments.*) AS item FROM task_assignments WHERE task_id = $1 ORDER BY created_at")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(json!({
        "task": task,
        "members": members.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "assignments": assignments.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()?,
        "available_actions": task_available_actions(&task, &user)
    })))
}

fn task_available_actions(task: &Value, user: &CurrentUser) -> Vec<&'static str> {
    let status = task.get("status").and_then(Value::as_str).unwrap_or("");
    let mut actions = Vec::new();
    if user.is_sa() || user.actions.contains("task.dispatch") {
        match status {
            "draft" => actions.push("submit"),
            "coordination_pending" => actions.push("confirm"),
            "confirmation_pending" => actions.push("start"),
            "in_progress" | "risk" | "acceptance_rejected" => {
                actions.push("pause");
                actions.push("submit_acceptance");
            }
            "acceptance_pending" => {
                actions.push("accept");
                actions.push("reject");
            }
            "completed" => actions.push("archive"),
            _ => {}
        }
    }
    actions
}

async fn create_task(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.create")?;
    let task_no = value_str(
        &payload,
        "task_no",
        &format!("TASK-{}", Utc::now().timestamp_millis()),
    );
    let status = value_str(&payload, "status", "draft");
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO tasks(task_no, name, sub_type, level, priority, owner_org_id, project_id, visibility, initiator_id, owner_id, acceptor_id, start_at, due_at, estimated_total_hours, summary, deliverable_requirement, status, payload, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING id",
    )
    .bind(task_no.clone())
    .bind(value_str(&payload, "name", ""))
    .bind(payload.get("sub_type").and_then(Value::as_str))
    .bind(value_str(&payload, "level", "normal"))
    .bind(value_str(&payload, "priority", "normal"))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "project_id"))
    .bind(value_str(&payload, "visibility", "normal"))
    .bind(user.person_id)
    .bind(value_uuid(&payload, "owner_id").or(user.person_id))
    .bind(value_uuid(&payload, "acceptor_id"))
    .bind(parse_datetime(&payload, "start_at"))
    .bind(parse_datetime(&payload, "due_at"))
    .bind(value_f64(&payload, "estimated_total_hours", 0.0))
    .bind(value_str(&payload, "summary", ""))
    .bind(value_str(&payload, "deliverable_requirement", ""))
    .bind(status)
    .bind(payload.clone())
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;

    if let Some(members) = payload.get("members").and_then(Value::as_array) {
        for member in members {
            insert_task_member(&state.db, id, member).await?;
        }
    }
    upsert_search(
        &state.db,
        "task",
        id,
        &format!(
            "{} {} {}",
            task_no,
            value_str(&payload, "name", ""),
            value_str(&payload, "summary", "")
        ),
    )
    .await?;
    emit_event(
        &state.db,
        "task.created",
        "task",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn insert_task_member(db: &PgPool, task_id: Uuid, member: &Value) -> Result<(), ApiError> {
    let person_id = value_uuid(member, "person_id")
        .ok_or_else(|| ApiError::bad_request("member.person_id is required"))?;
    sqlx::query(
        "INSERT INTO task_members(task_id, person_id, member_role, work_content, estimated_total_hours, daily_commitment_type, daily_commitment_hours, start_date, due_date, approval_status, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (task_id, person_id, member_role) DO UPDATE SET
           work_content = EXCLUDED.work_content,
           estimated_total_hours = EXCLUDED.estimated_total_hours,
           daily_commitment_type = EXCLUDED.daily_commitment_type,
           daily_commitment_hours = EXCLUDED.daily_commitment_hours,
           start_date = EXCLUDED.start_date,
           due_date = EXCLUDED.due_date,
           approval_status = EXCLUDED.approval_status,
           payload = EXCLUDED.payload",
    )
    .bind(task_id)
    .bind(person_id)
    .bind(value_str(member, "member_role", "member"))
    .bind(value_str(member, "work_content", ""))
    .bind(value_f64(member, "estimated_total_hours", 0.0))
    .bind(value_str(member, "daily_commitment_type", "hours"))
    .bind(value_f64(member, "daily_commitment_hours", 0.0))
    .bind(parse_date(member, "start_date"))
    .bind(parse_date(member, "due_date"))
    .bind(value_str(member, "approval_status", "pending"))
    .bind(member.clone())
    .execute(db)
    .await?;
    Ok(())
}

async fn update_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_task_editable(&state.db, &user, id).await?;
    let before = get_json_by_id(&state.db, "tasks", id).await?;
    if before.get("status").and_then(Value::as_str) == Some("archived") {
        return Err(ApiError::conflict("archived task is readonly"));
    }
    sqlx::query(
        "UPDATE tasks SET
          name = COALESCE($2, name),
          sub_type = COALESCE($3, sub_type),
          level = COALESCE($4, level),
          priority = COALESCE($5, priority),
          owner_org_id = COALESCE($6, owner_org_id),
          project_id = COALESCE($7, project_id),
          visibility = COALESCE($8, visibility),
          owner_id = COALESCE($9, owner_id),
          acceptor_id = COALESCE($10, acceptor_id),
          start_at = COALESCE($11, start_at),
          due_at = COALESCE($12, due_at),
          estimated_total_hours = COALESCE($13, estimated_total_hours),
          summary = COALESCE($14, summary),
          deliverable_requirement = COALESCE($15, deliverable_requirement),
          payload = payload || $16,
          updated_at = now(), updated_by = $17, version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("sub_type").and_then(Value::as_str))
    .bind(payload.get("level").and_then(Value::as_str))
    .bind(payload.get("priority").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_org_id"))
    .bind(value_uuid(&payload, "project_id"))
    .bind(payload.get("visibility").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_id"))
    .bind(value_uuid(&payload, "acceptor_id"))
    .bind(parse_datetime(&payload, "start_at"))
    .bind(parse_datetime(&payload, "due_at"))
    .bind(payload.get("estimated_total_hours").and_then(Value::as_f64))
    .bind(payload.get("summary").and_then(Value::as_str))
    .bind(
        payload
            .get("deliverable_requirement")
            .and_then(Value::as_str),
    )
    .bind(payload.clone())
    .bind(user.person_id)
    .execute(&state.db)
    .await?;
    if let Some(members) = payload.get("members").and_then(Value::as_array) {
        for member in members {
            insert_task_member(&state.db, id, member).await?;
        }
    }
    sqlx::query("INSERT INTO task_change_logs(task_id, changed_by, change_type, reason, before_payload, after_payload) VALUES ($1,$2,'task.updated',$3,$4,$5)")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "reason", ""))
        .bind(before)
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "task.changed",
        "task",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn transition_task(
    db: &PgPool,
    user: &CurrentUser,
    id: Uuid,
    from: &[&str],
    to: &str,
    event: &str,
    payload: Value,
) -> Result<Json<Value>, ApiError> {
    ensure_task_editable(db, user, id).await?;
    let current: String = sqlx::query_scalar("SELECT status FROM tasks WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| ApiError::not_found("task not found"))?;
    if !from.contains(&current.as_str()) {
        return Err(ApiError::conflict(format!(
            "invalid task transition: {current} -> {to}"
        )));
    }
    sqlx::query("UPDATE tasks SET status = $2, updated_at = now(), updated_by = $3, version = version + 1 WHERE id = $1")
        .bind(id)
        .bind(to)
        .bind(user.person_id)
        .execute(db)
        .await?;
    sqlx::query("INSERT INTO task_change_logs(task_id, changed_by, change_type, reason, after_payload) VALUES ($1,$2,$3,$4,$5)")
        .bind(id)
        .bind(user.person_id)
        .bind(event)
        .bind(value_str(&payload, "reason", ""))
        .bind(json!({ "from": current, "to": to, "payload": payload }))
        .execute(db)
        .await?;
    emit_event(
        db,
        event,
        "task",
        Some(id),
        user.person_id,
        json!({ "from": current, "to": to }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": to })))
}

async fn submit_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let preview = compute_dispatch_preview(&state.db, id).await?;
    let has_blocking = preview
        .get("requires_approval")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let to = if has_blocking {
        "coordination_pending"
    } else {
        "confirmation_pending"
    };
    let result = transition_task(
        &state.db,
        &user,
        id,
        &["draft"],
        to,
        "task.submitted",
        payload,
    )
    .await?;
    if has_blocking {
        create_approval_ticket_internal(&state.db, id, "cross_department", user.person_id, preview)
            .await?;
    }
    Ok(result)
}

async fn confirm_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let _ = transition_task(
        &state.db,
        &user,
        id,
        &["coordination_pending", "confirmation_pending"],
        "in_progress",
        "task.started",
        payload,
    )
    .await?;
    recalculate_task_workload(&state.db, id).await?;
    Ok(Json(json!({ "id": id, "status": "in_progress" })))
}

async fn start_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let _ = transition_task(
        &state.db,
        &user,
        id,
        &["confirmation_pending"],
        "in_progress",
        "task.started",
        payload,
    )
    .await?;
    recalculate_task_workload(&state.db, id).await?;
    Ok(Json(json!({ "id": id, "status": "in_progress" })))
}

async fn pause_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    transition_task(
        &state.db,
        &user,
        id,
        &["in_progress", "risk"],
        "paused",
        "task.paused",
        payload,
    )
    .await
}

async fn cancel_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    transition_task(
        &state.db,
        &user,
        id,
        &[
            "draft",
            "coordination_pending",
            "confirmation_pending",
            "in_progress",
            "paused",
            "risk",
        ],
        "cancelled",
        "task.cancelled",
        payload,
    )
    .await
}

async fn submit_acceptance(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_required_resources(&state.db, id).await?;
    sqlx::query("INSERT INTO task_acceptances(task_id, submitter_id, acceptor_id, status, comment, payload) SELECT id, $2, acceptor_id, 'pending', $3, $4 FROM tasks WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    transition_task(
        &state.db,
        &user,
        id,
        &["in_progress", "risk", "acceptance_rejected"],
        "acceptance_pending",
        "task.acceptance_requested",
        payload,
    )
    .await
}

async fn accept_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if !user.is_sa() {
        user.require_action("task.accept")?;
    }
    sqlx::query("UPDATE task_acceptances SET status = 'accepted', acceptor_id = $2, comment = $3, acted_at = now() WHERE task_id = $1 AND status = 'pending'")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    transition_task(
        &state.db,
        &user,
        id,
        &["acceptance_pending"],
        "completed",
        "task.accepted",
        payload,
    )
    .await
}

async fn reject_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if !user.is_sa() {
        user.require_action("task.accept")?;
    }
    sqlx::query("UPDATE task_acceptances SET status = 'rejected', acceptor_id = $2, comment = $3, acted_at = now() WHERE task_id = $1 AND status = 'pending'")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    transition_task(
        &state.db,
        &user,
        id,
        &["acceptance_pending"],
        "acceptance_rejected",
        "task.rejected",
        payload,
    )
    .await
}

async fn archive_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let result = transition_task(
        &state.db,
        &user,
        id,
        &["completed"],
        "archived",
        "task.archived",
        payload,
    )
    .await?;
    sqlx::query("UPDATE resource_files SET status = 'archived' WHERE id IN (SELECT resource_id FROM resource_links WHERE object_type = 'task' AND object_id = $1)")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(result)
}

async fn create_assignment(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    ensure_task_editable(&state.db, &user, task_id).await?;
    let owner_id = value_uuid(&payload, "owner_id")
        .ok_or_else(|| ApiError::bad_request("owner_id is required"))?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO task_assignments(task_id, title, owner_id, collaborator_ids, start_date, due_date, estimated_total_hours, daily_commitment_type, daily_commitment_hours, acceptor_id, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
    )
    .bind(task_id)
    .bind(value_str(&payload, "title", ""))
    .bind(owner_id)
    .bind(value_uuid_vec(&payload, "collaborator_ids"))
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "due_date"))
    .bind(value_f64(&payload, "estimated_total_hours", 0.0))
    .bind(value_str(&payload, "daily_commitment_type", "hours"))
    .bind(value_f64(&payload, "daily_commitment_hours", 0.0))
    .bind(value_uuid(&payload, "acceptor_id"))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    emit_event(
        &state.db,
        "task.changed",
        "assignment",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_assignment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let task_id: Uuid = sqlx::query_scalar("SELECT task_id FROM task_assignments WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    ensure_task_editable(&state.db, &user, task_id).await?;
    sqlx::query(
        "UPDATE task_assignments SET
          title = COALESCE($2, title), owner_id = COALESCE($3, owner_id),
          collaborator_ids = COALESCE($4, collaborator_ids), start_date = COALESCE($5, start_date), due_date = COALESCE($6, due_date),
          estimated_total_hours = COALESCE($7, estimated_total_hours), daily_commitment_type = COALESCE($8, daily_commitment_type),
          daily_commitment_hours = COALESCE($9, daily_commitment_hours), progress = COALESCE($10, progress), status = COALESCE($11, status),
          payload = payload || $12, updated_at = now(), version = version + 1
         WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("title").and_then(Value::as_str))
    .bind(value_uuid(&payload, "owner_id"))
    .bind(if payload.get("collaborator_ids").is_some() { Some(value_uuid_vec(&payload, "collaborator_ids")) } else { None })
    .bind(parse_date(&payload, "start_date"))
    .bind(parse_date(&payload, "due_date"))
    .bind(payload.get("estimated_total_hours").and_then(Value::as_f64))
    .bind(payload.get("daily_commitment_type").and_then(Value::as_str))
    .bind(payload.get("daily_commitment_hours").and_then(Value::as_f64))
    .bind(payload.get("progress").and_then(Value::as_f64))
    .bind(payload.get("status").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    emit_event(
        &state.db,
        "task.changed",
        "assignment",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn assignment_progress(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let row = sqlx::query(
        "SELECT task_id, owner_id, collaborator_ids FROM task_assignments WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    let owner_id: Uuid = row.get("owner_id");
    let collaborators: Vec<Uuid> = row.get("collaborator_ids");
    if !user.is_sa()
        && Some(owner_id) != user.person_id
        && !user
            .person_id
            .is_some_and(|pid| collaborators.contains(&pid))
    {
        return Err(ApiError::forbidden(
            "only assignment owner or collaborator can report progress",
        ));
    }
    sqlx::query(
        "INSERT INTO task_progress_reports(assignment_id, reporter_id, spent_hours, progress, content, result_resource_ids, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(id)
    .bind(user.person_id.ok_or_else(|| ApiError::forbidden("person binding is required"))?)
    .bind(value_f64(&payload, "spent_hours", 0.0))
    .bind(value_f64(&payload, "progress", 0.0))
    .bind(value_str(&payload, "content", ""))
    .bind(value_uuid_vec(&payload, "result_resource_ids"))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE task_assignments SET progress = GREATEST(progress, $2), confirmed_spent_hours = confirmed_spent_hours + $3, status = CASE WHEN $2 >= 100 THEN 'pending_confirmation' ELSE 'in_progress' END, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(value_f64(&payload, "progress", 0.0))
        .bind(value_f64(&payload, "spent_hours", 0.0))
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "assignment.progress_reported",
        "assignment",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn assignment_submit_result(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    assignment_progress(State(state), Path(id), user, Json(json!({
        "spent_hours": value_f64(&payload, "spent_hours", 0.0),
        "progress": 100.0,
        "content": value_str(&payload, "content", ""),
        "result_resource_ids": payload.get("result_resource_ids").cloned().unwrap_or_else(|| json!([]))
    }))).await
}

async fn compute_dispatch_preview(db: &PgPool, task_id: Uuid) -> Result<Value, ApiError> {
    let task = sqlx::query("SELECT owner_org_id, project_id FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_one(db)
        .await?;
    let owner_org_id: Option<Uuid> = task.try_get("owner_org_id").ok();
    let members = sqlx::query(
        "SELECT tm.person_id, p.primary_org_id, p.dispatch_enabled, p.work_status,
          tm.daily_commitment_type, tm.daily_commitment_hours::float8 AS daily_hours, tm.start_date, tm.due_date
         FROM task_members tm
         JOIN persons p ON p.id = tm.person_id
         WHERE tm.task_id = $1",
    )
    .bind(task_id)
    .fetch_all(db)
    .await?;
    let mut conflicts = Vec::new();
    let mut requires_approval = false;
    for row in members {
        let person_id: Uuid = row.get("person_id");
        let primary_org_id: Option<Uuid> = row.try_get("primary_org_id").ok();
        let dispatch_enabled: bool = row.get("dispatch_enabled");
        let work_status: String = row.get("work_status");
        if owner_org_id.is_some() && primary_org_id.is_some() && owner_org_id != primary_org_id {
            requires_approval = true;
            conflicts.push(json!({ "type": "cross_department", "person_id": person_id, "target_org_id": primary_org_id }));
        }
        if !dispatch_enabled || work_status != "active" {
            requires_approval = true;
            conflicts.push(json!({ "type": "person_unavailable", "person_id": person_id, "work_status": work_status }));
        }
        let start: Option<NaiveDate> = row.try_get("start_date").ok();
        let end: Option<NaiveDate> = row.try_get("due_date").ok();
        let daily_type: String = row.get("daily_commitment_type");
        let daily_hours: f64 = row.get("daily_hours");
        if let (Some(start), Some(end)) = (start, end) {
            let preview = preview_person_load(
                db,
                person_id,
                start,
                end,
                daily_hours,
                daily_type == "full_day",
            )
            .await?;
            if preview
                .get("conflicts")
                .and_then(Value::as_array)
                .is_some_and(|v| !v.is_empty())
            {
                requires_approval = true;
                conflicts.push(json!({ "type": "workload_conflict", "person_id": person_id, "preview": preview }));
            }
        }
    }
    Ok(
        json!({ "task_id": task_id, "requires_approval": requires_approval, "conflicts": conflicts }),
    )
}

async fn dispatch_preview(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    let task_id = value_uuid(&payload, "task_id")
        .ok_or_else(|| ApiError::bad_request("task_id is required"))?;
    ensure_task_visible(&state.db, &user, task_id).await?;
    Ok(Json(compute_dispatch_preview(&state.db, task_id).await?))
}

async fn dispatch_submit(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    let task_id = value_uuid(&payload, "task_id")
        .ok_or_else(|| ApiError::bad_request("task_id is required"))?;
    let preview = compute_dispatch_preview(&state.db, task_id).await?;
    let dispatch_type = if preview
        .get("requires_approval")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "cross_department"
    } else {
        "direct"
    };
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO dispatch_requests(task_id, requester_id, dispatch_type, status, reason, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    )
    .bind(task_id)
    .bind(user.person_id.ok_or_else(|| ApiError::forbidden("person binding is required"))?)
    .bind(dispatch_type)
    .bind(if dispatch_type == "direct" { "effective" } else { "pending" })
    .bind(value_str(&payload, "reason", ""))
    .bind(json!({ "request": payload, "preview": preview }))
    .fetch_one(&state.db)
    .await?;
    if dispatch_type == "direct" {
        sqlx::query("UPDATE tasks SET status = 'confirmation_pending', updated_at = now() WHERE id = $1 AND status = 'draft'")
            .bind(task_id)
            .execute(&state.db)
            .await?;
        emit_event(
            &state.db,
            "dispatch.effective",
            "dispatch_request",
            Some(id),
            user.person_id,
            json!({ "task_id": task_id }),
        )
        .await?;
    } else {
        create_approval_ticket_internal(
            &state.db,
            task_id,
            "cross_department",
            user.person_id,
            preview,
        )
        .await?;
        sqlx::query(
            "UPDATE tasks SET status = 'coordination_pending', updated_at = now() WHERE id = $1",
        )
        .bind(task_id)
        .execute(&state.db)
        .await?;
    }
    Ok(Json(json!({ "id": id, "dispatch_type": dispatch_type })))
}

async fn create_approval_ticket_internal(
    db: &PgPool,
    task_id: Uuid,
    ticket_type: &str,
    actor_id: Option<Uuid>,
    payload: Value,
) -> Result<Uuid, ApiError> {
    let target_person_ids: Vec<Uuid> =
        sqlx::query_scalar("SELECT person_id FROM task_members WHERE task_id = $1")
            .bind(task_id)
            .fetch_all(db)
            .await?;
    let target_org_id: Option<Uuid> =
        sqlx::query_scalar("SELECT owner_org_id FROM tasks WHERE id = $1")
            .bind(task_id)
            .fetch_optional(db)
            .await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO approval_tickets(task_id, ticket_type, target_person_ids, target_org_id, status, created_by, payload)
         VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING id",
    )
    .bind(task_id)
    .bind(ticket_type)
    .bind(target_person_ids)
    .bind(target_org_id)
    .bind(actor_id)
    .bind(payload.clone())
    .fetch_one(db)
    .await?;
    sqlx::query("INSERT INTO approval_steps(ticket_id, step_order, approver_source, payload) VALUES ($1, 1, 'default_approver', $2)")
        .bind(id)
        .bind(payload)
        .execute(db)
        .await?;
    emit_event(
        db,
        "approval.requested",
        "approval_ticket",
        Some(id),
        actor_id,
        json!({ "task_id": task_id, "ticket_type": ticket_type }),
    )
    .await?;
    create_todo_for_ticket(db, id).await?;
    Ok(id)
}

async fn create_todo_for_ticket(db: &PgPool, ticket_id: Uuid) -> Result<(), sqlx::Error> {
    let row = sqlx::query("SELECT task_id, target_org_id FROM approval_tickets WHERE id = $1")
        .bind(ticket_id)
        .fetch_one(db)
        .await?;
    let target_org_id: Option<Uuid> = row.try_get("target_org_id").ok();
    let task_id: Option<Uuid> = row.try_get("task_id").ok();
    let approvers: Vec<Uuid> = if let Some(org_id) = target_org_id {
        sqlx::query_scalar("SELECT unnest(default_approver_ids) FROM organizations WHERE id = $1")
            .bind(org_id)
            .fetch_all(db)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    for approver in approvers {
        sqlx::query(
            "INSERT INTO todo_items(todo_type, title, target_type, target_id, assignee_id, action_url)
             VALUES ('approval', '待审批协调单', 'approval_ticket', $1, $2, $3)",
        )
        .bind(ticket_id)
        .bind(approver)
        .bind(format!("/approvals/{ticket_id}"))
        .execute(db)
        .await?;
    }
    if let Some(task_id) = task_id {
        emit_event(
            db,
            "notification.todo_created",
            "task",
            Some(task_id),
            None,
            json!({ "ticket_id": ticket_id }),
        )
        .await?;
    }
    Ok(())
}

async fn list_approvals(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(approval_tickets.*) AS item FROM approval_tickets
         WHERE ($1::text IS NULL OR status = $1)
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(query.status.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_approval(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let ticket = get_json_by_id(&state.db, "approval_tickets", id).await?;
    let steps = sqlx::query("SELECT to_jsonb(approval_steps.*) AS item FROM approval_steps WHERE ticket_id = $1 ORDER BY step_order")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "ticket": ticket, "steps": steps.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn approval_action(
    state: Arc<AppState>,
    user: CurrentUser,
    id: Uuid,
    action: &str,
    status: &str,
    payload: Value,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.approve")?;
    if matches!(action, "reject" | "adjust" | "escalate")
        && value_str(&payload, "comment", "").is_empty()
    {
        return Err(ApiError::bad_request(
            "comment is required for reject/adjust/escalate",
        ));
    }
    let ticket = get_json_by_id(&state.db, "approval_tickets", id).await?;
    if ticket.get("status").and_then(Value::as_str) != Some("pending") && action != "escalate" {
        return Err(ApiError::conflict("approval ticket is not pending"));
    }
    sqlx::query("UPDATE approval_tickets SET status = $2, updated_at = now(), payload = payload || $3 WHERE id = $1")
        .bind(id)
        .bind(status)
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE approval_steps SET approver_id = $2, action = $3, comment = $4, acted_at = now(), payload = payload || $5 WHERE ticket_id = $1 AND step_order = (SELECT current_step FROM approval_tickets WHERE id = $1)")
        .bind(id)
        .bind(user.person_id)
        .bind(action)
        .bind(value_str(&payload, "comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    let task_id = ticket
        .get("task_id")
        .and_then(Value::as_str)
        .and_then(|v| Uuid::parse_str(v).ok());
    if let Some(task_id) = task_id {
        match status {
            "approved" | "adjusted_approved" => {
                sqlx::query("UPDATE tasks SET status = 'confirmation_pending', updated_at = now() WHERE id = $1 AND status = 'coordination_pending'")
                    .bind(task_id)
                    .execute(&state.db)
                    .await?;
                emit_event(
                    &state.db,
                    "approval.completed",
                    "approval_ticket",
                    Some(id),
                    user.person_id,
                    json!({ "status": status }),
                )
                .await?;
            }
            "rejected" => {
                sqlx::query("UPDATE tasks SET status = 'draft', updated_at = now() WHERE id = $1 AND status = 'coordination_pending'")
                    .bind(task_id)
                    .execute(&state.db)
                    .await?;
                emit_event(
                    &state.db,
                    "approval.rejected",
                    "approval_ticket",
                    Some(id),
                    user.person_id,
                    json!({ "status": status }),
                )
                .await?;
            }
            _ => {}
        }
    }
    sqlx::query("UPDATE todo_items SET status = 'completed' WHERE target_type = 'approval_ticket' AND target_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "status": status })))
}

async fn approval_approve(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    approval_action(state, user, id, "approve", "approved", payload).await
}

async fn approval_reject(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    approval_action(state, user, id, "reject", "rejected", payload).await
}

async fn approval_adjust(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    approval_action(state, user, id, "adjust", "adjusted_approved", payload).await
}

async fn approval_escalate(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.approve")?;
    sqlx::query("UPDATE approval_tickets SET status = 'escalated', current_step = current_step + 1, updated_at = now(), payload = payload || $2 WHERE id = $1")
        .bind(id)
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO approval_steps(ticket_id, step_order, approver_source, comment, payload) SELECT id, current_step, 'escalated', $2, $3 FROM approval_tickets WHERE id = $1")
        .bind(id)
        .bind(value_str(&payload, "comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "approval.escalated",
        "approval_ticket",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "escalated" })))
}

async fn create_meeting_record(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let record_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO coordination_meeting_records(ticket_id, meeting_at, participants, topic, conclusion, next_actions, resource_ids, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(id)
    .bind(parse_datetime(&payload, "meeting_at").unwrap_or_else(Utc::now))
    .bind(value_uuid_vec(&payload, "participants"))
    .bind(value_str(&payload, "topic", ""))
    .bind(value_str(&payload, "conclusion", ""))
    .bind(value_str(&payload, "next_actions", ""))
    .bind(value_uuid_vec(&payload, "resource_ids"))
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": record_id })))
}

async fn preview_person_load(
    db: &PgPool,
    person_id: Uuid,
    start: NaiveDate,
    end: NaiveDate,
    daily_hours: f64,
    full_day: bool,
) -> Result<Value, ApiError> {
    let standard_hours = sqlx::query_scalar::<_, f64>(
        "SELECT daily_standard_hours::float8 FROM persons WHERE id = $1",
    )
    .bind(person_id)
    .fetch_optional(db)
    .await?
    .unwrap_or(8.0);
    let mut date = start;
    let mut days = Vec::new();
    let mut conflicts = Vec::new();
    while date <= end {
        let existing = sqlx::query(
            "SELECT COALESCE(committed_hours::float8, 0) AS committed_hours, COALESCE(full_day_occupied, false) AS full_day_occupied
             FROM workload_snapshots WHERE person_id = $1 AND work_date = $2",
        )
        .bind(person_id)
        .bind(date)
        .fetch_optional(db)
        .await?;
        let (existing_hours, existing_full_day) = existing
            .map(|r| {
                (
                    r.get::<f64, _>("committed_hours"),
                    r.get::<bool, _>("full_day_occupied"),
                )
            })
            .unwrap_or((0.0, false));
        let committed = if full_day {
            standard_hours
        } else {
            daily_hours
        };
        let total = existing_hours + committed;
        let load_rate = if standard_hours > 0.0 {
            total / standard_hours
        } else {
            0.0
        };
        if total > standard_hours {
            conflicts.push(json!({ "type": "overload", "date": date, "overload_hours": total - standard_hours, "risk_level": if load_rate >= 1.5 { "high" } else { "medium" } }));
        }
        if full_day && existing_hours > 0.0 || existing_full_day {
            conflicts
                .push(json!({ "type": "full_day_overlap", "date": date, "risk_level": "high" }));
        }
        days.push(json!({ "date": date, "existing_hours": existing_hours, "new_hours": committed, "total_hours": total, "standard_hours": standard_hours, "load_rate": load_rate }));
        date = date
            .succ_opt()
            .ok_or_else(|| ApiError::bad_request("invalid date range"))?;
    }
    Ok(
        json!({ "person_id": person_id, "start": start, "end": end, "days": days, "conflicts": conflicts }),
    )
}

async fn workload_preview(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let person_id = value_uuid(&payload, "person_id")
        .ok_or_else(|| ApiError::bad_request("person_id is required"))?;
    let start = parse_date(&payload, "start_date")
        .ok_or_else(|| ApiError::bad_request("start_date is required"))?;
    let end = parse_date(&payload, "due_date")
        .ok_or_else(|| ApiError::bad_request("due_date is required"))?;
    Ok(Json(
        preview_person_load(
            &state.db,
            person_id,
            start,
            end,
            value_f64(&payload, "daily_commitment_hours", 0.0),
            value_str(&payload, "daily_commitment_type", "hours") == "full_day",
        )
        .await?,
    ))
}

async fn recalculate_task_workload(db: &PgPool, task_id: Uuid) -> Result<(), ApiError> {
    let members = sqlx::query(
        "SELECT person_id, daily_commitment_type, daily_commitment_hours::float8 AS daily_hours, start_date, due_date
         FROM task_members WHERE task_id = $1",
    )
    .bind(task_id)
    .fetch_all(db)
    .await?;
    for row in members {
        let person_id: Uuid = row.get("person_id");
        let start: Option<NaiveDate> = row.try_get("start_date").ok();
        let end: Option<NaiveDate> = row.try_get("due_date").ok();
        let daily_type: String = row.get("daily_commitment_type");
        let daily_hours: f64 = row.get("daily_hours");
        if let (Some(start), Some(end)) = (start, end) {
            write_workload_range(
                db,
                person_id,
                task_id,
                None,
                start,
                end,
                daily_hours,
                daily_type == "full_day",
            )
            .await?;
        }
    }
    let assignments = sqlx::query(
        "SELECT id, owner_id, daily_commitment_type, daily_commitment_hours::float8 AS daily_hours, start_date, due_date
         FROM task_assignments WHERE task_id = $1",
    )
    .bind(task_id)
    .fetch_all(db)
    .await?;
    for row in assignments {
        let assignment_id: Uuid = row.get("id");
        let person_id: Uuid = row.get("owner_id");
        let start: Option<NaiveDate> = row.try_get("start_date").ok();
        let end: Option<NaiveDate> = row.try_get("due_date").ok();
        let daily_type: String = row.get("daily_commitment_type");
        let daily_hours: f64 = row.get("daily_hours");
        if let (Some(start), Some(end)) = (start, end) {
            write_workload_range(
                db,
                person_id,
                task_id,
                Some(assignment_id),
                start,
                end,
                daily_hours,
                daily_type == "full_day",
            )
            .await?;
        }
    }
    Ok(())
}

async fn write_workload_range(
    db: &PgPool,
    person_id: Uuid,
    task_id: Uuid,
    assignment_id: Option<Uuid>,
    start: NaiveDate,
    end: NaiveDate,
    daily_hours: f64,
    full_day: bool,
) -> Result<(), ApiError> {
    let standard_hours = sqlx::query_scalar::<_, f64>(
        "SELECT daily_standard_hours::float8 FROM persons WHERE id = $1",
    )
    .bind(person_id)
    .fetch_optional(db)
    .await?
    .unwrap_or(8.0);
    let mut date = start;
    while date <= end {
        let committed = if full_day {
            standard_hours
        } else {
            daily_hours
        };
        sqlx::query(
            "INSERT INTO workload_snapshots(person_id, work_date, committed_hours, standard_hours, load_rate, full_day_occupied, source_task_ids, source_assignment_ids)
             VALUES ($1,$2,$3,$4,$3 / NULLIF($4, 0),$5,ARRAY[$6]::uuid[],CASE WHEN $7::uuid IS NULL THEN '{}'::uuid[] ELSE ARRAY[$7]::uuid[] END)
             ON CONFLICT (person_id, work_date) DO UPDATE SET
               committed_hours = workload_snapshots.committed_hours + EXCLUDED.committed_hours,
               standard_hours = EXCLUDED.standard_hours,
               load_rate = (workload_snapshots.committed_hours + EXCLUDED.committed_hours) / NULLIF(EXCLUDED.standard_hours, 0),
               full_day_occupied = workload_snapshots.full_day_occupied OR EXCLUDED.full_day_occupied,
               source_task_ids = array(SELECT DISTINCT unnest(workload_snapshots.source_task_ids || EXCLUDED.source_task_ids)),
               source_assignment_ids = array(SELECT DISTINCT unnest(workload_snapshots.source_assignment_ids || EXCLUDED.source_assignment_ids)),
               updated_at = now()",
        )
        .bind(person_id)
        .bind(date)
        .bind(committed)
        .bind(standard_hours)
        .bind(full_day)
        .bind(task_id)
        .bind(assignment_id)
        .execute(db)
        .await?;
        let snap = sqlx::query("SELECT committed_hours::float8 AS committed_hours, load_rate::float8 AS load_rate, full_day_occupied FROM workload_snapshots WHERE person_id = $1 AND work_date = $2")
            .bind(person_id)
            .bind(date)
            .fetch_one(db)
            .await?;
        let committed_hours: f64 = snap.get("committed_hours");
        let load_rate: f64 = snap.get("load_rate");
        let full_day_occupied: bool = snap.get("full_day_occupied");
        if committed_hours > standard_hours
            || (full_day && full_day_occupied && committed_hours > standard_hours)
        {
            let risk_level = if load_rate >= 1.5 { "high" } else { "medium" };
            sqlx::query(
                "INSERT INTO conflict_records(conflict_type, risk_level, person_id, task_id, assignment_id, conflict_date_start, conflict_date_end, overload_hours, payload)
                 VALUES ($1,$2,$3,$4,$5,$6,$6,GREATEST($7 - $8, 0),$9)",
            )
            .bind(if full_day { "full_day_overlap" } else { "overload" })
            .bind(risk_level)
            .bind(person_id)
            .bind(task_id)
            .bind(assignment_id)
            .bind(date)
            .bind(committed_hours)
            .bind(standard_hours)
            .bind(json!({ "load_rate": load_rate }))
            .execute(db)
            .await?;
        }
        date = date
            .succ_opt()
            .ok_or_else(|| ApiError::bad_request("invalid date range"))?;
    }
    Ok(())
}

async fn workload_person(
    State(state): State<Arc<AppState>>,
    Path(person_id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT jsonb_build_object('date', work_date, 'committed_hours', committed_hours::float8, 'standard_hours', standard_hours::float8, 'load_rate', load_rate::float8, 'full_day_occupied', full_day_occupied, 'source_task_ids', source_task_ids, 'source_assignment_ids', source_assignment_ids) AS item FROM workload_snapshots WHERE person_id = $1 ORDER BY work_date")
        .bind(person_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "person_id": person_id, "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn workload_calendar(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let start = query
        .get("start")
        .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Utc::now().date_naive());
    let end = query
        .get("end")
        .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
        .unwrap_or(start + Duration::days(30));
    let rows = sqlx::query("SELECT jsonb_build_object('person_id', person_id, 'date', work_date, 'committed_hours', committed_hours::float8, 'standard_hours', standard_hours::float8, 'load_rate', load_rate::float8, 'full_day_occupied', full_day_occupied) AS item FROM workload_snapshots WHERE work_date BETWEEN $1 AND $2 ORDER BY work_date")
        .bind(start)
        .bind(end)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "start": start, "end": end, "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn list_conflicts(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', c.id, 'conflict_type', c.conflict_type, 'risk_level', c.risk_level, 'person_id', c.person_id,
          'task_id', c.task_id, 'assignment_id', c.assignment_id, 'conflict_date_start', c.conflict_date_start,
          'conflict_date_end', c.conflict_date_end, 'overload_hours', c.overload_hours::float8, 'status', c.status,
          'handler_id', c.handler_id, 'resolution_action', c.resolution_action, 'resolution_comment', c.resolution_comment,
          'payload', c.payload, 'created_at', c.created_at
        ) AS item
         FROM conflict_records c
         WHERE ($1::text IS NULL OR c.status = $1)
         ORDER BY c.created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(query.status.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_conflict(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    Ok(Json(
        get_json_by_id(&state.db, "conflict_records", id).await?,
    ))
}

async fn resolve_conflict(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    sqlx::query("UPDATE conflict_records SET status = 'resolved', handler_id = $2, resolution_action = $3, resolution_comment = $4, updated_at = now(), payload = payload || $5 WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "resolution_action", "resolved"))
        .bind(value_str(&payload, "resolution_comment", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "conflict.resolved",
        "conflict_record",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "resolved" })))
}

async fn force_conflict(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.approve")?;
    if value_str(&payload, "reason", "").is_empty() {
        return Err(ApiError::bad_request(
            "reason is required for force schedule",
        ));
    }
    sqlx::query("UPDATE conflict_records SET status = 'forced', handler_id = $2, resolution_action = 'force', resolution_comment = $3, updated_at = now(), payload = payload || $4 WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "reason", ""))
        .bind(payload.clone())
        .execute(&state.db)
        .await?;
    audit(
        &state.db,
        user.person_id,
        "conflict_record",
        Some(id),
        "conflict.force",
        json!({}),
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "forced" })))
}

async fn recalculate_conflicts(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("task.dispatch")?;
    if let Some(task_id) = value_uuid(&payload, "task_id") {
        recalculate_task_workload(&state.db, task_id).await?;
        Ok(Json(json!({ "task_id": task_id, "recalculated": true })))
    } else {
        Err(ApiError::bad_request(
            "task_id is required for recalculation",
        ))
    }
}

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
        "SELECT to_jsonb(rf.*) AS item FROM resource_files rf
         WHERE rf.deleted_at IS NULL
           AND ($1::text IS NULL OR rf.name ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR rf.status = $2)
         ORDER BY rf.created_at DESC LIMIT $3 OFFSET $4",
    )
    .bind(query.q.clone())
    .bind(query.status.clone())
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

async fn dashboard(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    let role = if user.is_sa() {
        "sa"
    } else {
        user.role_codes
            .first()
            .map(String::as_str)
            .unwrap_or("employee")
    };
    let todo_count: i64 = if let Some(person_id) = user.person_id {
        sqlx::query_scalar(
            "SELECT count(*) FROM todo_items WHERE assignee_id = $1 AND status = 'open'",
        )
        .bind(person_id)
        .fetch_one(&state.db)
        .await?
    } else {
        0
    };
    let task_count: i64 = if let Some(person_id) = user.person_id {
        sqlx::query_scalar("SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND (owner_id = $1 OR initiator_id = $1 OR acceptor_id = $1)")
            .bind(person_id)
            .fetch_one(&state.db)
            .await?
    } else {
        0
    };
    let conflict_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open'")
            .fetch_one(&state.db)
            .await?;
    Ok(Json(json!({
        "role": role,
        "available_roles": user.role_codes,
        "layout": {},
        "widgets": {
            "todos": { "count": todo_count },
            "my_tasks": { "count": task_count },
            "conflicts": { "count": conflict_count }
        },
        "quick_actions": [],
        "permissions": user.actions
    })))
}

async fn dashboard_widgets(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    dashboard(State(state), user).await
}

async fn dashboard_role_entry(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    let role_id = user.role_ids.first().copied();
    let item = if let Some(role_id) = role_id {
        sqlx::query("SELECT to_jsonb(role_entry_configs.*) AS item FROM role_entry_configs WHERE role_id = $1")
            .bind(role_id)
            .fetch_optional(&state.db)
            .await?
            .map(|r| json_row(&r, "item"))
            .transpose()?
    } else {
        None
    };
    Ok(Json(
        json!({ "entry": item.unwrap_or_else(|| json!({ "default_home": if user.is_sa() { "/admin" } else { "/dashboard" } })) }),
    ))
}

async fn dashboard_role_view(
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let role = value_str(&payload, "role", "");
    if !user.role_codes.contains(&role) && !user.is_sa() {
        return Err(ApiError::forbidden("role view is not available"));
    }
    Ok(Json(json!({ "role": role })))
}

async fn recent_activities(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(domain_events.*) AS item FROM domain_events ORDER BY created_at DESC LIMIT 50")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn config_modules(user: CurrentUser) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    Ok(Json(json!({
        "modules": ["task_template", "approval_rule", "alert_rule", "view_config", "tool_config", "invitation_policy", "role_entry"]
    })))
}

async fn get_config(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let item = sqlx::query(
        "SELECT to_jsonb(config_versions.*) AS item FROM config_versions
         WHERE namespace = $1 AND status = 'published'
         ORDER BY version_no DESC LIMIT 1",
    )
    .bind(namespace)
    .fetch_optional(&state.db)
    .await?
    .map(|r| json_row(&r, "item"))
    .transpose()?;
    Ok(Json(json!({ "config": item })))
}

async fn save_config_draft(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("config.publish")?;
    let next_no: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version_no), 0) + 1 FROM config_versions WHERE namespace = $1",
    )
    .bind(&namespace)
    .fetch_one(&state.db)
    .await?;
    let id = sqlx::query_scalar::<_, Uuid>("INSERT INTO config_versions(namespace, version_no, status, payload, created_by) VALUES ($1,$2,'draft',$3,$4) RETURNING id")
        .bind(&namespace)
        .bind(next_no)
        .bind(payload.clone())
        .bind(user.person_id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(
        json!({ "id": id, "namespace": namespace, "version_no": next_no, "status": "draft" }),
    ))
}

async fn publish_config(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("config.publish")?;
    let id = value_uuid(&payload, "id").ok_or_else(|| ApiError::bad_request("id is required"))?;
    sqlx::query("UPDATE config_versions SET status = 'disabled' WHERE namespace = $1 AND status = 'published'")
        .bind(&namespace)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE config_versions SET status = 'published', published_by = $2, published_at = now() WHERE id = $1 AND namespace = $3")
        .bind(id)
        .bind(user.person_id)
        .bind(&namespace)
        .execute(&state.db)
        .await?;
    audit(
        &state.db,
        user.person_id,
        "config_version",
        Some(id),
        "config.published",
        json!({}),
        payload.clone(),
        value_str(&payload, "reason", "").as_str(),
        None,
    )
    .await?;
    emit_event(
        &state.db,
        "config.published",
        "config_version",
        Some(id),
        user.person_id,
        json!({ "namespace": namespace }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "published" })))
}

async fn disable_config(
    State(state): State<Arc<AppState>>,
    Path(namespace): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("config.publish")?;
    let id = value_uuid(&payload, "id").ok_or_else(|| ApiError::bad_request("id is required"))?;
    sqlx::query("UPDATE config_versions SET status = 'disabled' WHERE id = $1 AND namespace = $2")
        .bind(id)
        .bind(namespace)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "status": "disabled" })))
}

async fn config_versions(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(config_versions.*) AS item FROM config_versions ORDER BY namespace, version_no DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn runtime_status(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    readyz(State(state)).await
}

async fn list_todos(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(todo_items.*) AS item FROM todo_items
         WHERE ($1::uuid IS NULL OR assignee_id = $1)
           AND ($2::text IS NULL OR status = $2)
         ORDER BY created_at DESC LIMIT $3 OFFSET $4",
    )
    .bind(if user.is_sa() { None } else { user.person_id })
    .bind(query.status.clone())
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn complete_todo(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    sqlx::query("UPDATE todo_items SET status = 'completed' WHERE id = $1 AND ($2::bool OR assignee_id = $3)")
        .bind(id)
        .bind(user.is_sa())
        .bind(user.person_id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "status": "completed" })))
}

async fn list_notifications(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(notifications.*) AS item FROM notifications
         WHERE ($1::uuid IS NULL OR receiver_id = $1)
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(if user.is_sa() { None } else { user.person_id })
    .bind(query.limit())
    .bind(query.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn read_notification(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    sqlx::query(
        "UPDATE notifications SET read_at = now() WHERE id = $1 AND ($2::bool OR receiver_id = $3)",
    )
    .bind(id)
    .bind(user.is_sa())
    .bind(user.person_id)
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "id": id, "read": true })))
}

async fn list_reports(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT report_type, count(*) AS count, max(generated_at) AS latest FROM report_snapshots GROUP BY report_type ORDER BY report_type")
        .fetch_all(&state.db)
        .await?;
    let items: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "report_type": r.get::<String, _>("report_type"),
                "count": r.get::<i64, _>("count"),
                "latest": r.try_get::<DateTime<Utc>, _>("latest").ok()
            })
        })
        .collect();
    Ok(Json(json!({ "items": items })))
}

async fn get_report(
    State(state): State<Arc<AppState>>,
    Path(report_type): Path<String>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let item = sqlx::query("SELECT to_jsonb(report_snapshots.*) AS item FROM report_snapshots WHERE report_type = $1 ORDER BY generated_at DESC LIMIT 1")
        .bind(&report_type)
        .fetch_optional(&state.db)
        .await?
        .map(|r| json_row(&r, "item"))
        .transpose()?;
    Ok(Json(
        json!({ "report_type": report_type, "snapshot": item }),
    ))
}

async fn export_report(
    State(state): State<Arc<AppState>>,
    Path(report_type): Path<String>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("report.export")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO report_snapshots(report_type, scope_type, scope_id, period_start, period_end, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    )
    .bind(&report_type)
    .bind(value_str(&payload, "scope_type", "user"))
    .bind(value_uuid(&payload, "scope_id").or(user.person_id))
    .bind(parse_date(&payload, "period_start"))
    .bind(parse_date(&payload, "period_end"))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "report_snapshot",
        Some(id),
        "report.export",
        json!({}),
        payload,
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "generated" })))
}

async fn list_tools(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(t.*) AS item FROM tool_entries t
         WHERE t.enabled AND (
           $1::bool OR NOT EXISTS (SELECT 1 FROM tool_permissions tp WHERE tp.tool_id = t.id)
           OR EXISTS (
             SELECT 1 FROM tool_permissions tp WHERE tp.tool_id = t.id
             AND ((tp.subject_type = 'person' AND tp.subject_id = $2) OR (tp.subject_type = 'role' AND tp.subject_id = ANY($3)))
           )
         )
         ORDER BY category, name",
    )
    .bind(user.is_sa())
    .bind(user.person_id)
    .bind(&user.role_ids)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn get_tool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    Ok(Json(get_json_by_id(&state.db, "tool_entries", id).await?))
}

async fn create_tool(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("tool.manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO tool_entries(name, category, entry_type, entry_url, enabled, icon, description, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "category", "common"))
    .bind(value_str(&payload, "entry_type", "external"))
    .bind(value_str(&payload, "entry_url", ""))
    .bind(value_bool(&payload, "enabled", true))
    .bind(value_str(&payload, "icon", ""))
    .bind(value_str(&payload, "description", ""))
    .bind(payload.clone())
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_tool(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("tool.manage")?;
    sqlx::query(
        "UPDATE tool_entries SET name = COALESCE($2, name), category = COALESCE($3, category), entry_type = COALESCE($4, entry_type),
         entry_url = COALESCE($5, entry_url), enabled = COALESCE($6, enabled), icon = COALESCE($7, icon), description = COALESCE($8, description),
         payload = payload || $9, updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("category").and_then(Value::as_str))
    .bind(payload.get("entry_type").and_then(Value::as_str))
    .bind(payload.get("entry_url").and_then(Value::as_str))
    .bind(payload.get("enabled").and_then(Value::as_bool))
    .bind(payload.get("icon").and_then(Value::as_str))
    .bind(payload.get("description").and_then(Value::as_str))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn tool_context(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let source_type = value_str(&payload, "source_type", "manual");
    let source_id = value_uuid(&payload, "source_id");
    if source_type == "project" {
        if let Some(source_id) = source_id {
            ensure_project_visible(&state.db, &user, source_id).await?;
        }
    }
    if source_type == "task" {
        if let Some(source_id) = source_id {
            ensure_task_visible(&state.db, &user, source_id).await?;
        }
    }
    Ok(Json(json!({
        "tool_id": id,
        "source_type": source_type,
        "source_id": source_id,
        "user": { "person_id": user.person_id, "roles": user.role_codes },
        "sensitive_context_included": false
    })))
}

async fn record_tool_usage(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let usage_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO tool_usage_logs(tool_id, user_id, source_type, source_id, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(id)
    .bind(user.person_id)
    .bind(value_str(&payload, "source_type", "manual"))
    .bind(value_uuid(&payload, "source_id"))
    .bind(payload)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": usage_id })))
}

async fn tool_usage(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query(
        "SELECT to_jsonb(tool_usage_logs.*) AS item FROM tool_usage_logs WHERE tool_id = $1 AND ($2::bool OR user_id = $3) ORDER BY used_at DESC LIMIT 100",
    )
    .bind(id)
    .bind(user.is_sa())
    .bind(user.person_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn gantt(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let start = query
        .get("start")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let end = query
        .get("end")
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.with_timezone(&Utc));
    let rows = sqlx::query(
        "SELECT jsonb_build_object(
          'id', t.id, 'type', 'task', 'title', CASE WHEN p.visibility = 'hidden' AND NOT $3::bool THEN '[隐藏任务]' ELSE t.name END,
          'start', t.start_at, 'end', t.due_at, 'progress', t.progress::float8, 'status', t.status,
          'risk_level', COALESCE((SELECT max(risk_level) FROM conflict_records c WHERE c.task_id = t.id AND c.status = 'open'), 'none'),
          'target_url', '/tasks/' || t.id::text, 'readonly', t.status = 'archived'
        ) AS item
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL
           AND ($1::timestamptz IS NULL OR t.due_at >= $1)
           AND ($2::timestamptz IS NULL OR t.start_at <= $2)
           AND ($3::bool OR t.visibility = 'normal' OR t.owner_id = $4 OR t.initiator_id = $4 OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = t.id AND tm.person_id = $4))
         ORDER BY t.start_at NULLS LAST LIMIT 500",
    )
    .bind(start)
    .bind(end)
    .bind(user.is_sa())
    .bind(user.person_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn gantt_summary(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let row = sqlx::query(
        "SELECT
          count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
          count(*) FILTER (WHERE status = 'acceptance_pending') AS acceptance_pending,
          count(*) FILTER (WHERE status = 'archived') AS archived
         FROM tasks WHERE deleted_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "in_progress": row.get::<i64, _>("in_progress"),
        "acceptance_pending": row.get::<i64, _>("acceptance_pending"),
        "archived": row.get::<i64, _>("archived")
    })))
}

async fn search(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let q = query.get("q").cloned().unwrap_or_default();
    let rows = sqlx::query(
        "SELECT jsonb_build_object('object_type', object_type, 'object_id', object_id, 'title', search_text, 'updated_at', updated_at) AS item
         FROM search_index_meta
         WHERE $1 = '' OR search_vector @@ plainto_tsquery('simple', $1) OR search_text ILIKE '%' || $1 || '%'
         ORDER BY updated_at DESC LIMIT 50",
    )
    .bind(q)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn search_suggest(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    search(State(state), user, Query(query)).await
}

async fn list_saved_filters(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let rows = sqlx::query("SELECT to_jsonb(saved_filters.*) AS item FROM saved_filters WHERE owner_id = $1 ORDER BY created_at DESC")
        .bind(user.person_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_saved_filter(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_business_access()?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO saved_filters(owner_id, filter_type, name, payload) VALUES ($1,$2,$3,$4) RETURNING id",
    )
    .bind(user.person_id)
    .bind(value_str(&payload, "filter_type", "task"))
    .bind(value_str(&payload, "name", ""))
    .bind(payload)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn list_invitation_templates(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let rows = sqlx::query("SELECT to_jsonb(invitation_templates.*) AS item FROM invitation_templates ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn create_invitation_template(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO invitation_templates(name, invite_type, default_org_id, default_role_ids, default_project_id, default_project_role, default_work_desc, need_approval, reviewer_source, required_fields, expires_in_days, max_uses, status, payload, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id",
    )
    .bind(value_str(&payload, "name", ""))
    .bind(value_str(&payload, "invite_type", "user"))
    .bind(value_uuid(&payload, "default_org_id"))
    .bind(value_uuid_vec(&payload, "default_role_ids"))
    .bind(value_uuid(&payload, "default_project_id"))
    .bind(payload.get("default_project_role").and_then(Value::as_str))
    .bind(value_str(&payload, "default_work_desc", ""))
    .bind(value_bool(&payload, "need_approval", true))
    .bind(value_str(&payload, "reviewer_source", "default_org"))
    .bind(payload.get("required_fields").cloned().unwrap_or_else(|| json!([])))
    .bind(value_i64(&payload, "expires_in_days", 7) as i32)
    .bind(value_i64(&payload, "max_uses", 1) as i32)
    .bind(value_str(&payload, "status", "enabled"))
    .bind(payload.clone())
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "invitation_template",
        Some(id),
        "invitation_template.created",
        json!({}),
        payload,
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn update_invitation_template(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    sqlx::query(
        "UPDATE invitation_templates SET name = COALESCE($2, name), status = COALESCE($3, status), default_org_id = COALESCE($4, default_org_id),
         default_role_ids = COALESCE($5, default_role_ids), default_project_id = COALESCE($6, default_project_id), need_approval = COALESCE($7, need_approval),
         required_fields = COALESCE($8, required_fields), expires_in_days = COALESCE($9, expires_in_days), max_uses = COALESCE($10, max_uses),
         payload = payload || $11, updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(payload.get("name").and_then(Value::as_str))
    .bind(payload.get("status").and_then(Value::as_str))
    .bind(value_uuid(&payload, "default_org_id"))
    .bind(if payload.get("default_role_ids").is_some() { Some(value_uuid_vec(&payload, "default_role_ids")) } else { None })
    .bind(value_uuid(&payload, "default_project_id"))
    .bind(payload.get("need_approval").and_then(Value::as_bool))
    .bind(payload.get("required_fields").cloned())
    .bind(payload.get("expires_in_days").and_then(Value::as_i64).map(|v| v as i32))
    .bind(payload.get("max_uses").and_then(Value::as_i64).map(|v| v as i32))
    .bind(payload.clone())
    .execute(&state.db)
    .await?;
    audit(
        &state.db,
        user.person_id,
        "invitation_template",
        Some(id),
        "invitation_template.updated",
        json!({}),
        payload,
        "",
        None,
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

async fn create_invitation_link(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let row = sqlx::query(
        "SELECT expires_in_days, max_uses, status FROM invitation_templates WHERE id = $1",
    )
    .bind(template_id)
    .fetch_one(&state.db)
    .await?;
    let status: String = row.get("status");
    if status != "enabled" {
        return Err(ApiError::conflict("invitation template is not enabled"));
    }
    let expires_in_days: i32 = row.get("expires_in_days");
    let max_uses: i32 = row.get("max_uses");
    let token = random_token();
    let token_hash = hash_token(&state.config.session_secret, &token);
    let expires_at = Utc::now() + Duration::days(expires_in_days as i64);
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO invitation_links(template_id, token_hash, expires_at, max_uses, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(template_id)
    .bind(token_hash)
    .bind(expires_at)
    .bind(max_uses)
    .bind(user.person_id)
    .fetch_one(&state.db)
    .await?;
    emit_event(
        &state.db,
        "invitation.created",
        "invitation_link",
        Some(id),
        user.person_id,
        json!({ "template_id": template_id }),
    )
    .await?;
    Ok(Json(json!({
        "id": id,
        "token": token,
        "url": format!("{}/register/invitation/{}", state.config.public_url.trim_end_matches('/'), token),
        "expires_at": expires_at,
        "max_uses": max_uses
    })))
}

async fn list_invitation_links(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object('id', id, 'template_id', template_id, 'expires_at', expires_at, 'max_uses', max_uses, 'used_count', used_count, 'status', status, 'created_by', created_by, 'created_at', created_at) AS item
         FROM invitation_links ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn disable_invitation_link(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    sqlx::query("UPDATE invitation_links SET status = 'disabled' WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "invitation.disabled",
        "invitation_link",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "disabled" })))
}

async fn get_invitation_token(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let token_hash = hash_token(&state.config.session_secret, &token);
    let row = sqlx::query(
        "SELECT il.id, il.expires_at, il.max_uses, il.used_count, il.status, to_jsonb(it.*) AS template
         FROM invitation_links il JOIN invitation_templates it ON it.id = il.template_id
         WHERE il.token_hash = $1",
    )
    .bind(token_hash)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("invitation token not found"))?;
    let status: String = row.get("status");
    let expires_at: DateTime<Utc> = row.get("expires_at");
    let used_count: i32 = row.get("used_count");
    let max_uses: i32 = row.get("max_uses");
    if status != "enabled" || expires_at < Utc::now() || used_count >= max_uses {
        return Err(ApiError::conflict(
            "invitation token is expired or exhausted",
        ));
    }
    Ok(Json(json!({
        "id": row.get::<Uuid, _>("id"),
        "expires_at": expires_at,
        "remaining_uses": max_uses - used_count,
        "template": row.get::<Value, _>("template")
    })))
}

async fn register_by_invitation(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let token_hash = hash_token(&state.config.session_secret, &token);
    let mut tx = state.db.begin().await?;
    let row = sqlx::query(
        "SELECT il.id AS link_id, il.used_count, il.max_uses, il.expires_at, il.status AS link_status,
          it.default_org_id, it.default_role_ids, it.default_project_id, it.default_project_role, it.default_work_desc, it.need_approval, it.status AS template_status
         FROM invitation_links il JOIN invitation_templates it ON it.id = il.template_id
         WHERE il.token_hash = $1 FOR UPDATE",
    )
    .bind(token_hash)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::not_found("invitation token not found"))?;
    let expires_at: DateTime<Utc> = row.get("expires_at");
    let link_status: String = row.get("link_status");
    let template_status: String = row.get("template_status");
    let used_count: i32 = row.get("used_count");
    let max_uses: i32 = row.get("max_uses");
    if link_status != "enabled"
        || template_status != "enabled"
        || expires_at < Utc::now()
        || used_count >= max_uses
    {
        return Err(ApiError::conflict(
            "invitation token is expired or exhausted",
        ));
    }
    let login_name = value_str(&payload, "login_name", "");
    let password = value_str(&payload, "password", "");
    let name = value_str(&payload, "name", &login_name);
    if login_name.is_empty() || password.is_empty() || name.is_empty() {
        return Err(ApiError::bad_request(
            "login_name, password and name are required",
        ));
    }
    let need_approval: bool = row.get("need_approval");
    let account_status = if need_approval { "pending" } else { "enabled" };
    let account_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO accounts(login_name, password_hash, status, payload) VALUES ($1,$2,$3,$4) RETURNING id",
    )
    .bind(&login_name)
    .bind(hash_password(&password))
    .bind(account_status)
    .bind(payload.clone())
    .fetch_one(&mut *tx)
    .await?;
    let default_org_id: Option<Uuid> = row.try_get("default_org_id").ok();
    let role_ids: Vec<Uuid> = row.get("default_role_ids");
    let person_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO persons(name, account_id, primary_org_id, system_role_ids, work_status, account_status, payload)
         VALUES ($1,$2,$3,$4,'active',$5,$6) RETURNING id",
    )
    .bind(name)
    .bind(account_id)
    .bind(default_org_id)
    .bind(role_ids)
    .bind(account_status)
    .bind(payload.clone())
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("UPDATE accounts SET person_id = $1 WHERE id = $2")
        .bind(person_id)
        .bind(account_id)
        .execute(&mut *tx)
        .await?;
    if let Some(org_id) = default_org_id {
        sqlx::query("INSERT INTO person_org_memberships(person_id, org_id, membership_type) VALUES ($1,$2,'primary') ON CONFLICT DO NOTHING")
            .bind(person_id)
            .bind(org_id)
            .execute(&mut *tx)
            .await?;
    }
    let link_id: Uuid = row.get("link_id");
    let registration_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO registration_requests(invitation_link_id, account_id, person_id, payload, status)
         VALUES ($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(link_id)
    .bind(account_id)
    .bind(person_id)
    .bind(payload.clone())
    .bind(if need_approval { "pending" } else { "approved" })
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("UPDATE invitation_links SET used_count = used_count + 1 WHERE id = $1")
        .bind(link_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    emit_event(
        &state.db,
        "registration.submitted",
        "registration_request",
        Some(registration_id),
        Some(person_id),
        payload,
    )
    .await?;
    Ok(Json(
        json!({ "registration_id": registration_id, "account_id": account_id, "person_id": person_id, "status": if need_approval { "pending" } else { "approved" } }),
    ))
}

async fn list_registrations(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let rows = sqlx::query("SELECT to_jsonb(registration_requests.*) AS item FROM registration_requests ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn approve_registration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    let row = sqlx::query("SELECT account_id, person_id FROM registration_requests WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let account_id: Option<Uuid> = row.try_get("account_id").ok();
    let person_id: Option<Uuid> = row.try_get("person_id").ok();
    sqlx::query("UPDATE registration_requests SET status = 'approved', reviewer_id = $2, review_comment = $3, reviewed_at = now() WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    if let Some(account_id) = account_id {
        sqlx::query("UPDATE accounts SET status = 'enabled' WHERE id = $1")
            .bind(account_id)
            .execute(&state.db)
            .await?;
    }
    if let Some(person_id) = person_id {
        sqlx::query("UPDATE persons SET account_status = 'enabled' WHERE id = $1")
            .bind(person_id)
            .execute(&state.db)
            .await?;
    }
    emit_event(
        &state.db,
        "registration.approved",
        "registration_request",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "approved" })))
}

async fn reject_registration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.invitation_manage")?;
    sqlx::query("UPDATE registration_requests SET status = 'rejected', reviewer_id = $2, review_comment = $3, reviewed_at = now() WHERE id = $1")
        .bind(id)
        .bind(user.person_id)
        .bind(value_str(&payload, "comment", ""))
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "registration.rejected",
        "registration_request",
        Some(id),
        user.person_id,
        payload,
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "rejected" })))
}

async fn admin_dashboard(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let pending_registrations: i64 =
        sqlx::query_scalar("SELECT count(*) FROM registration_requests WHERE status = 'pending'")
            .fetch_one(&state.db)
            .await?;
    let enabled_accounts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM accounts WHERE status = 'enabled'")
            .fetch_one(&state.db)
            .await?;
    let open_conflicts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM conflict_records WHERE status = 'open'")
            .fetch_one(&state.db)
            .await?;
    Ok(Json(
        json!({ "pending_registrations": pending_registrations, "enabled_accounts": enabled_accounts, "open_conflicts": open_conflicts }),
    ))
}

async fn list_accounts(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    let rows = sqlx::query(
        "SELECT jsonb_build_object('id', id, 'login_name', login_name, 'person_id', person_id, 'status', status, 'last_login_at', last_login_at, 'failed_login_count', failed_login_count, 'created_at', created_at) AS item
         FROM accounts WHERE deleted_at IS NULL ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "items": rows.iter().map(|r| json_row(r, "item")).collect::<Result<Vec<_>, _>>()? }),
    ))
}

async fn disable_account(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    sqlx::query("UPDATE accounts SET status = 'disabled', updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    emit_event(
        &state.db,
        "account.disabled",
        "account",
        Some(id),
        user.person_id,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "id": id, "status": "disabled" })))
}

async fn unlock_account(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_action("admin.manage")?;
    sqlx::query("UPDATE accounts SET status = 'enabled', failed_login_count = 0, updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "id": id, "status": "enabled" })))
}
