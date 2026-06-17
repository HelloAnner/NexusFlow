# 派发协同技术设计

## 1. 后端模块

Rust 模块建议：

```text
dispatch
approval
coordination
meeting_record
```

模块职责：

- 判断任务派发是否直接生效。
- 创建跨部门协调单。
- 管理审批流、审批动作和审批意见。
- 管理会议研讨记录。
- 驱动任务从待协调进入待确认或进行中。

## 2. 核心表

### 2.1 dispatch_request

字段：

- `id`。
- `task_id`。
- `requester_id`。
- `dispatch_type`：direct、cross_department、backfill、personal_record。
- `status`。
- `reason`。
- `created_at`。

### 2.2 approval_ticket

字段：

- `id`。
- `task_id`。
- `ticket_type`：cross_department、workload_conflict、hidden_project、force_schedule、major_change。
- `target_person_ids`。
- `target_org_id`。
- `status`：pending、approved、rejected、adjusted_approved、escalated。
- `current_step`。

### 2.3 approval_step

字段：

- `ticket_id`。
- `step_order`。
- `approver_id`。
- `approver_source`。
- `action`。
- `comment`。
- `acted_at`。

### 2.4 coordination_meeting_record

字段：

- `ticket_id`。
- `meeting_at`。
- `participants`。
- `topic`。
- `conclusion`。
- `next_actions`。
- `resource_ids`。

## 3. 审批动作

支持动作：

- 同意。
- 拒绝。
- 调整投入后同意。
- 调整周期后同意。
- 推荐其他人员。
- 升级到上级协调。

拒绝、调整、升级必须填写意见。

## 4. API

```text
POST /api/dispatch/preview
POST /api/dispatch/submit
GET  /api/approvals
GET  /api/approvals/{id}
POST /api/approvals/{id}/approve
POST /api/approvals/{id}/reject
POST /api/approvals/{id}/adjust
POST /api/approvals/{id}/escalate
POST /api/approvals/{id}/meeting-records
```

## 5. 权限

- 发起人必须有创建任务和选择候选人员的基础权限。
- 目标部门主任、副主任或技术监督可审批本部门人员被调用。
- 项目负责人只确认任务是否属于项目和分工边界，不替代资源审批。
- SA 不默认参与业务审批。

## 6. 事件

发布：

- `approval.requested`。
- `approval.approved`。
- `approval.rejected`。
- `approval.adjusted`。
- `approval.escalated`。
- `dispatch.effective`。

消费：

- 通知待办模块生成审批待办。
- 任务模块更新任务状态。
- 负载模块在审批通过后写入正式占用。
- 甘特图刷新待审批标记。

## 7. 前端实现

- 新建任务向导中的冲突与协调步骤调用 `dispatch/preview`。
- 协调单详情展示任务、人员、负载、冲突、审批历史和会议记录。
- 审批按钮根据后端 `available_actions` 展示。
- 后补填报确认页强调待发起人确认字段。

