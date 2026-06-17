# API 验证清单

每个 API 至少验证成功态、未登录 401、无权限 403、参数错误 400 或资源不存在 404。写接口还要验证审计、事件或后置查询。

## 基础健康

- `GET /healthz`
- `GET /readyz`

## 认证、邀请、SA

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/invitations/templates`
- `POST /api/invitations/templates`
- `PATCH /api/invitations/templates/{id}`
- `POST /api/invitations/templates/{id}/links`
- `GET /api/invitations/links`
- `POST /api/invitations/links/{id}/disable`
- `GET /api/register/invitation/{token}`
- `POST /api/register/invitation/{token}`
- `GET /api/admin/registrations`
- `POST /api/admin/registrations/{id}/approve`
- `POST /api/admin/registrations/{id}/reject`
- `GET /api/admin/dashboard`
- `GET /api/admin/accounts`
- `POST /api/admin/accounts/{id}/disable`
- `POST /api/admin/accounts/{id}/unlock`

## 组织、人员、技能

- `GET /api/orgs/tree`
- `GET /api/orgs`
- `POST /api/orgs`
- `PATCH /api/orgs/{id}`
- `POST /api/orgs/{id}/disable`
- `GET /api/users`
- `GET /api/users/{id}`
- `POST /api/users`
- `PATCH /api/users/{id}`
- `POST /api/users/{id}/disable`
- `GET /api/users/{id}/workload-summary`
- `GET /api/skills`
- `POST /api/skills`
- `PATCH /api/skills/{id}`
- `POST /api/skills/{id}/disable`

## 权限

- `GET /api/roles`
- `POST /api/roles`
- `PATCH /api/roles/{id}`
- `GET /api/roles/{id}/actions`
- `PUT /api/roles/{id}/actions`
- `GET /api/permissions/me`
- `POST /api/permissions/check`
- `GET /api/visibility-grants`
- `POST /api/visibility-grants`
- `DELETE /api/visibility-grants/{id}`
- `GET /api/audit/permission`

## 项目

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{id}`
- `PATCH /api/projects/{id}`
- `POST /api/projects/{id}/members`
- `PATCH /api/projects/{id}/members/{person_id}`
- `DELETE /api/projects/{id}/members/{person_id}`
- `POST /api/projects/{id}/visibility-grants`
- `POST /api/projects/{id}/archive`
- `GET /api/projects/{id}/stats`

## 任务与分工

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/{id}`
- `PATCH /api/tasks/{id}`
- `POST /api/tasks/{id}/submit`
- `POST /api/tasks/{id}/confirm`
- `POST /api/tasks/{id}/start`
- `POST /api/tasks/{id}/pause`
- `POST /api/tasks/{id}/cancel`
- `POST /api/tasks/{id}/submit-acceptance`
- `POST /api/tasks/{id}/accept`
- `POST /api/tasks/{id}/reject`
- `POST /api/tasks/{id}/archive`
- `POST /api/tasks/{id}/assignments`
- `PATCH /api/assignments/{id}`
- `POST /api/assignments/{id}/progress`
- `POST /api/assignments/{id}/submit-result`

## 派发、审批、负载、冲突

- `POST /api/dispatch/preview`
- `POST /api/dispatch/submit`
- `GET /api/approvals`
- `GET /api/approvals/{id}`
- `POST /api/approvals/{id}/approve`
- `POST /api/approvals/{id}/reject`
- `POST /api/approvals/{id}/adjust`
- `POST /api/approvals/{id}/escalate`
- `POST /api/approvals/{id}/meeting-records`
- `POST /api/workload/preview`
- `GET /api/workload/person/{person_id}`
- `GET /api/workload/calendar`
- `GET /api/conflicts`
- `GET /api/conflicts/{id}`
- `POST /api/conflicts/{id}/resolve`
- `POST /api/conflicts/{id}/force`
- `POST /api/conflicts/recalculate`

## 资料

- `GET /api/resources`
- `GET /api/resources/{id}`
- `POST /api/resources/upload-url`
- `POST /api/resources/complete-upload`
- `POST /api/resources/{id}/versions`
- `GET /api/resources/{id}/download-url`
- `POST /api/resources/{id}/link`
- `POST /api/resources/{id}/archive`
- `GET /api/resources/check-requirements`

## 首页、配置、通知、报表、工具、甘特、搜索

- `GET /api/dashboard`
- `GET /api/dashboard/widgets`
- `GET /api/dashboard/role-entry`
- `POST /api/dashboard/role-view`
- `GET /api/dashboard/recent-activities`
- `GET /api/config/modules`
- `GET /api/config/{namespace}`
- `POST /api/config/{namespace}/draft`
- `POST /api/config/{namespace}/publish`
- `POST /api/config/{namespace}/disable`
- `GET /api/config/versions`
- `GET /api/config/runtime-status`
- `GET /api/todos`
- `POST /api/todos/{id}/complete`
- `GET /api/notifications`
- `POST /api/notifications/{id}/read`
- `GET /api/reports`
- `GET /api/reports/{type}`
- `POST /api/reports/{type}/export`
- `GET /api/tools`
- `GET /api/tools/{id}`
- `POST /api/tools`
- `PATCH /api/tools/{id}`
- `POST /api/tools/{id}/context`
- `POST /api/tools/{id}/usage`
- `GET /api/tools/{id}/usage`
- `GET /api/gantt`
- `GET /api/gantt/summary`
- `GET /api/search`
- `GET /api/search/suggest`
- `GET /api/saved-filters`
- `POST /api/saved-filters`

