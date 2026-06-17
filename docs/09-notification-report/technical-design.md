# 通知、待办与报表技术设计

## 1. 后端模块

Rust 模块建议：

```text
todo
notification
report
metric
```

模块职责：

- 根据领域事件生成待办。
- 发送站内通知。
- 生成报表快照。
- 提供报表查询和导出。

## 2. 核心表

### 2.1 todo_item

字段：

- `id`。
- `todo_type`。
- `title`。
- `target_type`。
- `target_id`。
- `assignee_id`。
- `status`。
- `due_at`。
- `action_url`。

### 2.2 notification

字段：

- `id`。
- `title`。
- `content`。
- `receiver_id`。
- `channel`。
- `read_at`。
- `source_event_id`。

### 2.3 report_snapshot

字段：

- `id`。
- `report_type`。
- `scope_type`。
- `scope_id`。
- `period_start`。
- `period_end`。
- `payload`。
- `generated_at`。

## 3. 事件消费

消费事件：

- 任务创建、变更、验收、归档。
- 审批发起、完成、超时。
- 冲突生成、解决。
- 资料上传、归档。
- 注册提交、审核。

待办必须能跳转到具体处理位置。

## 4. API

```text
GET  /api/todos
POST /api/todos/{id}/complete
GET  /api/notifications
POST /api/notifications/{id}/read
GET  /api/reports
GET  /api/reports/{type}
POST /api/reports/{type}/export
```

## 5. 权限

- 待办只返回分配给当前用户或当前角色范围的数据。
- 通知不得泄露隐藏项目标题。
- 报表明细必须按权限裁剪。
- 汇总指标只统计当前用户可见范围。

## 6. 异步任务

- 审批超时扫描。
- 截止提醒扫描。
- 报表预计算。
- 导出文件生成。
- 通知重试。

Redis 只做轻量队列，PostgreSQL 记录任务状态和重试次数。

## 7. 前端实现

- 待办中心服务端分页。
- 通知中心支持未读筛选。
- 报表页按角色默认范围加载。
- 导出使用异步任务，完成后提供下载链接。

