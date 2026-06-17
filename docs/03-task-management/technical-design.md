# 任务管理技术设计

## 1. 后端模块

Rust 模块建议：

```text
task
assignment
milestone
progress
acceptance
archive
```

模块职责：

- 创建任务草稿和正式任务。
- 管理任务成员、分工、里程碑、进度和成果。
- 管理任务状态流。
- 管理任务变更留痕。
- 提供任务列表、详情、甘特图、搜索和报表的数据源。

## 2. 核心表

### 2.1 task

字段：

- `id`。
- `task_no`。
- `name`。
- `task_type_id`。
- `sub_type`。
- `level`。
- `priority`。
- `owner_org_id`。
- `project_id`。
- `visibility`。
- `initiator_id`。
- `owner_id`。
- `acceptor_id`。
- `start_at`。
- `due_at`。
- `estimated_total_hours`。
- `summary`。
- `deliverable_requirement`。
- `status`。
- `template_snapshot_id`。

索引：

- `task_no` 唯一。
- `status`。
- `owner_id`。
- `project_id`。
- `owner_org_id`。
- `start_at, due_at`。

### 2.2 task_member

字段：

- `task_id`。
- `person_id`。
- `member_role`。
- `work_content`。
- `estimated_total_hours`。
- `daily_commitment_type`：hours、full_day。
- `daily_commitment_hours`。
- `start_date`。
- `due_date`。
- `approval_status`。

### 2.3 task_assignment

分工表，字段包含责任人、协作人、时间、投入、预计总工时、进度、状态、验收人。

### 2.4 task_change_log

保存任务概述、成员、时间、投入、成果要求等变更。

## 3. 状态机

任务状态：

```text
draft -> coordination_pending -> confirmation_pending -> in_progress -> acceptance_pending -> completed -> archived
```

特殊状态：

- `paused`。
- `risk`。
- `acceptance_rejected`。
- `cancelled`。

状态流转必须通过服务层函数，不允许直接更新状态字段。

## 4. API

```text
GET    /api/tasks
POST   /api/tasks
GET    /api/tasks/{id}
PATCH  /api/tasks/{id}
POST   /api/tasks/{id}/submit
POST   /api/tasks/{id}/confirm
POST   /api/tasks/{id}/start
POST   /api/tasks/{id}/pause
POST   /api/tasks/{id}/cancel
POST   /api/tasks/{id}/submit-acceptance
POST   /api/tasks/{id}/accept
POST   /api/tasks/{id}/reject
POST   /api/tasks/{id}/archive

POST   /api/tasks/{id}/assignments
PATCH  /api/assignments/{id}
POST   /api/assignments/{id}/progress
POST   /api/assignments/{id}/submit-result
```

## 5. 权限

- 创建任务需要 `task.create`。
- 派发任务需要 `task.dispatch` 和目标人员数据范围。
- 员工只能维护自己的分工进度和成果。
- 任务负责人可维护任务分工和确认成果。
- 项目负责人可维护项目相关任务，但不能绕过跨部门审批。
- 归档后默认只读。

## 6. 事件

发布：

- `task.created`。
- `task.submitted`。
- `task.started`。
- `task.changed`。
- `task.acceptance_requested`。
- `task.accepted`。
- `task.rejected`。
- `task.archived`。
- `assignment.progress_reported`。

消费：

- 负载冲突模块重新计算。
- 甘特图缓存失效。
- 通知待办生成。
- 搜索索引更新。
- 报表快照更新。

## 7. 前端实现

- 任务列表服务端分页。
- 新建任务使用多步骤表单。
- 人员选择步骤调用负载预估接口。
- 任务详情页按页签懒加载。
- 状态操作按钮由后端返回 `available_actions`。
- 变更操作需要填写原因。

