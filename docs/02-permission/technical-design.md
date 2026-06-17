# 权限技术设计

## 1. 后端模块

Rust 模块建议：

```text
permission
role
data_scope
visibility
audit
```

模块职责：

- 管理角色和操作权限。
- 计算组织范围、项目范围和任务可见性。
- 为列表、详情、搜索、报表生成查询过滤条件。
- 管理隐藏项目和指定范围授权。
- 记录权限审计。

## 2. 核心表

### 2.1 role

字段：

- `id`。
- `code`。
- `name`。
- `role_type`：sa、admin、leader、manager、project_owner、task_owner、employee、pending。
- `priority`。
- `enabled`。

### 2.2 permission_action

字段：

- `id`。
- `module`。
- `action`。
- `description`。

示例：

- `task.create`。
- `task.dispatch`。
- `task.approve`。
- `project.manage_member`。
- `resource.download`。
- `admin.invitation_manage`。

### 2.3 role_action

角色和操作权限关系。

### 2.4 data_scope_rule

字段：

- `role_id`。
- `scope_type`：self、department、managed_departments、center、custom。
- `org_ids`。
- `project_scope_type`。
- `project_ids`。

### 2.5 visibility_grant

用于隐藏项目、指定范围任务、资料授权。

字段：

- `object_type`。
- `object_id`。
- `subject_type`：person、role、org。
- `subject_id`。
- `grant_actions`。
- `expires_at`。

## 3. 权限计算

流程：

```text
解析账号 -> 查询人员 -> 查询角色 -> 操作权限校验 -> 数据范围计算 -> 对象状态校验
```

列表查询必须使用后端生成的过滤条件：

- 组织范围过滤。
- 项目范围过滤。
- 隐藏项目授权过滤。
- 个人事项过滤。
- 资料继承过滤。

禁止前端获取全量后隐藏。

## 4. API

```text
GET    /api/roles
POST   /api/roles
PATCH  /api/roles/{id}
GET    /api/roles/{id}/actions
PUT    /api/roles/{id}/actions

GET    /api/permissions/me
POST   /api/permissions/check
GET    /api/visibility-grants
POST   /api/visibility-grants
DELETE /api/visibility-grants/{id}

GET    /api/audit/permission
```

## 5. SA 与待审核用户

- SA 拥有全部后台配置能力。
- SA 访问隐藏项目、个人事项、敏感资料时必须写审计。
- 待审核用户无业务数据范围。
- 待审核用户只允许访问注册资料、审核状态和账号安全基础接口。

## 6. 缓存

Redis 缓存：

- 用户角色集合。
- 用户操作权限集合。
- 用户组织范围。
- 用户项目范围。
- 隐藏授权摘要。

缓存 key 必须包含权限版本。

失效场景：

- 角色权限变更。
- 人员组织变更。
- 项目成员变更。
- 隐藏授权变更。
- 邀请审核通过。

## 7. 审计

审计字段：

- 操作人。
- 操作对象。
- 操作类型。
- 来源 IP。
- 请求 ID。
- 变更前摘要。
- 变更后摘要。
- 原因。

必须审计：

- 修改角色。
- 修改数据范围。
- 添加隐藏授权。
- SA 敏感访问。
- 导出任务、项目、人员、资料。
- 强制安排。
- 邀请注册审核。

## 8. 前端实现

- 路由层根据 `/api/permissions/me` 控制菜单。
- 操作按钮由权限指令或 hook 控制展示。
- 页面仍需处理后端返回的权限错误。
- 角色管理页使用矩阵组件编辑模块动作。
- 数据范围配置页按组织树和项目选择器配置。

