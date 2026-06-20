use axum::{
    Json, Router,
    body::Body,
    extract::{FromRequestParts, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, Uri, header, request::Parts},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post, put},
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use include_dir::{Dir, include_dir};
use redis::aio::MultiplexedConnection;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Column, PgPool, Row, postgres::PgPoolOptions};
use std::{
    collections::{HashMap, HashSet},
    env,
    net::SocketAddr,
    sync::Arc,
};
use tokio::sync::Mutex;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use uuid::Uuid;

include!("app/core.rs");
include!("app/routes.rs");
include!("shared/runtime.rs");
include!("shared/generic_read.rs");
include!("domains/auth.rs");
include!("domains/organization_personnel.rs");
include!("domains/organization_moves.rs");
include!("domains/person_memberships.rs");
include!("domains/person_skills.rs");
include!("domains/permission.rs");
include!("domains/data_scope.rs");
include!("domains/access_helpers.rs");
include!("domains/detail_workbench.rs");
include!("domains/task_workbench.rs");
include!("domains/project.rs");
include!("domains/task_core.rs");
include!("domains/delete_lifecycle.rs");
include!("domains/task_flow.rs");
include!("domains/task_assignment_review.rs");
include!("domains/resource_requirement.rs");
include!("domains/dispatch_approval.rs");
include!("domains/workload_conflict.rs");
include!("domains/resource.rs");
include!("domains/dashboard_config.rs");
include!("domains/report_scope.rs");
include!("domains/notification_report_tool.rs");
include!("domains/gantt_search.rs");
include!("domains/invitation_admin.rs");
