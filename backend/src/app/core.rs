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
    sub_type: Option<String>,
    priority: Option<String>,
    visibility: Option<String>,
    org_id: Option<Uuid>,
    project_id: Option<Uuid>,
    owner_id: Option<Uuid>,
    member_id: Option<Uuid>,
    role_id: Option<Uuid>,
    object_type: Option<String>,
    object_id: Option<Uuid>,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
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
