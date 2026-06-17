# 负载与冲突技术设计

## 1. 后端模块

Rust 模块建议：

```text
workload
conflict
risk
capacity
```

模块职责：

- 计算人员每日负载。
- 识别工时超载、全天重叠、休假冲突和截止风险。
- 给任务派发、人员详情、甘特图和报表提供负载数据。
- 管理冲突处理状态和处理建议。

## 2. 核心表

### 2.1 workload_snapshot

字段：

- `person_id`。
- `work_date`。
- `committed_hours`。
- `standard_hours`。
- `load_rate`。
- `full_day_occupied`。
- `source_task_ids`。
- `source_assignment_ids`。

### 2.2 conflict_record

字段：

- `id`。
- `conflict_type`。
- `risk_level`。
- `person_id`。
- `task_id`。
- `assignment_id`。
- `conflict_date_start`。
- `conflict_date_end`。
- `overload_hours`。
- `status`。
- `handler_id`。
- `resolution_action`。
- `resolution_comment`。

### 2.3 risk_record

记录任务、分工、资料、审批等风险。

## 3. 计算规则

每日负载：

```text
load_rate = committed_hours / standard_hours
```

截止风险：

```text
remaining_hours = estimated_total_hours - confirmed_spent_hours
available_hours = sum(available_capacity_before_due)
has_due_risk = remaining_hours > available_hours
```

全天任务：

- 记为占满当日标准工时。
- 与任何其他任务重叠都生成冲突。
- 人员选择器置灰。

## 4. API

```text
POST /api/workload/preview
GET  /api/workload/person/{person_id}
GET  /api/workload/calendar
GET  /api/conflicts
GET  /api/conflicts/{id}
POST /api/conflicts/{id}/resolve
POST /api/conflicts/{id}/force
POST /api/conflicts/recalculate
```

## 5. 异步任务

触发重新计算：

- 任务发布。
- 分工变更。
- 人员状态变更。
- 休假任务提交。
- 审批通过。
- 强制安排。
- 配置容量规则变更。

计算结果写入快照，实时预览不写正式快照。

## 6. 权限

- 员工只看本人负载。
- 任务负责人看任务成员负载摘要。
- 部门主任看本部门人员负载。
- 中心领导看中心汇总。
- 隐藏项目导致的占用按权限脱敏。

## 7. 前端实现

- 人员负载日历按周/月切换。
- 冲突中心服务端分页。
- 冲突详情抽屉展示时间线、涉及任务、建议动作。
- 甘特图读取冲突标记并定位到冲突详情。

