# 项目管理技术设计

## 1. 后端模块

Rust 模块建议：

```text
project
project_member
project_visibility
project_archive
```

模块职责：

- 管理项目基础信息。
- 管理项目成员和项目身份。
- 管理隐藏项目授权。
- 提供项目任务、项目资料、项目甘特和项目报表数据。
- 管理项目归档。

## 2. 核心表

### 2.1 project

字段：

- `id`。
- `project_no`。
- `name`。
- `project_type`。
- `level`。
- `owner_org_id`。
- `leader_id`。
- `managed_by_id`。
- `status`。
- `visibility`。
- `start_date`。
- `end_date`。
- `summary`。

### 2.2 project_member

字段：

- `project_id`。
- `person_id`。
- `project_role`。
- `work_desc`。
- `org_snapshot`。
- `joined_at`。
- `left_at`。
- `active`。

### 2.3 project_visibility_grant

隐藏项目授权。

## 3. API

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/{id}
PATCH  /api/projects/{id}
POST   /api/projects/{id}/members
PATCH  /api/projects/{id}/members/{person_id}
DELETE /api/projects/{id}/members/{person_id}
POST   /api/projects/{id}/visibility-grants
POST   /api/projects/{id}/archive
GET    /api/projects/{id}/stats
```

## 4. 权限

- 项目负责人可维护项目任务和成员职责。
- 外部门成员参与任务仍需部门审批。
- 隐藏项目必须显式授权。
- 未授权用户在搜索、甘特图、资料和报表中不可见。

## 5. 事件

发布：

- `project.created`。
- `project.updated`。
- `project.member_changed`。
- `project.visibility_changed`。
- `project.archived`。

消费：

- 权限缓存刷新。
- 搜索索引更新。
- 项目甘特缓存失效。
- 报表快照更新。

## 6. 前端实现

- 项目列表服务端分页。
- 项目详情页按概览、成员、任务、甘特、资料、授权、日志分页签。
- 项目成员管理支持批量导入和退出。
- 授权页所有变更二次确认。

