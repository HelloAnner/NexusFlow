fn api_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(auth_me))
        .route("/system/branding", get(system_branding))
        .route("/orgs/tree", get(org_tree))
        .route("/orgs", get(list_orgs).post(create_org))
        .route("/orgs/{id}", patch(update_org).delete(delete_org))
        .route("/orgs/{id}/disable", post(disable_org))
        .route("/orgs/{id}/move", post(move_org))
        .route("/users", get(list_users).post(create_user))
        .route("/users/{id}", get(get_user).patch(update_user).delete(delete_user))
        .route("/users/{id}/disable", post(disable_user))
        .route("/users/{id}/skills", put(set_user_skills))
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
            "/data-scope-rules",
            get(list_data_scope_rules).post(create_data_scope_rule),
        )
        .route(
            "/data-scope-rules/{id}",
            patch(update_data_scope_rule).delete(delete_data_scope_rule),
        )
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
        .route("/tasks/{id}", get(get_task).patch(update_task).delete(delete_task))
        .route("/tasks/{id}/submit", post(submit_task))
        .route("/tasks/{id}/confirm", post(confirm_task))
        .route("/tasks/{id}/start", post(start_task))
        .route("/tasks/{id}/pause", post(pause_task))
        .route("/tasks/{id}/cancel", post(cancel_task))
        .route("/tasks/{id}/submit-acceptance", post(submit_acceptance))
        .route("/tasks/{id}/accept", post(accept_task))
        .route("/tasks/{id}/reject", post(reject_task))
        .route("/tasks/{id}/archive", post(archive_task))
        .route(
            "/tasks/{id}/resource-requirements",
            put(set_task_resource_requirements),
        )
        .route("/tasks/{id}/assignments", post(create_assignment))
        .route("/assignments/{id}", patch(update_assignment))
        .route("/assignments/{id}/progress", post(assignment_progress))
        .route(
            "/assignments/{id}/submit-result",
            post(assignment_submit_result),
        )
        .route("/assignments/{id}/confirm", post(assignment_confirm))
        .route("/assignments/{id}/return", post(assignment_return))
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
