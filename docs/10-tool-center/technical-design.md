# 智能工具台技术设计

## 1. 后端模块

Rust 模块建议：

```text
tool_center
tool_permission
tool_context
tool_usage
```

模块职责：

- 管理工具入口。
- 控制工具可见范围。
- 生成工具上下文。
- 记录工具使用。
- 管理外链和内嵌安全策略。

## 2. 核心表

### 2.1 tool_entry

字段：

- `id`。
- `name`。
- `category`：common、agent。
- `entry_type`：external、embedded、internal。
- `entry_url`。
- `enabled`。
- `icon`。
- `description`。

### 2.2 tool_permission

字段：

- `tool_id`。
- `subject_type`：role、org、person。
- `subject_id`。
- `actions`。

### 2.3 tool_usage_log

字段：

- `tool_id`。
- `user_id`。
- `source_type`：task、project、resource、manual。
- `source_id`。
- `used_at`。

## 3. API

```text
GET  /api/tools
GET  /api/tools/{id}
POST /api/tools
PATCH /api/tools/{id}
POST /api/tools/{id}/context
POST /api/tools/{id}/usage
GET  /api/tools/{id}/usage
```

## 4. 上下文策略

工具上下文可能包含：

- 当前任务。
- 当前项目。
- 当前资料。
- 当前用户角色。

规则：

- 隐藏项目上下文必须校验授权。
- 外链工具默认不传敏感上下文。
- 文件类工具通过对象存储交换文件。
- 内嵌工具必须配置允许域名和 CSP。

## 5. 权限

- 工具入口按角色、组织、人员裁剪。
- 工具使用记录只对本人、管理员和授权管理者可见。
- SA 可配置所有工具。

## 6. 前端实现

- 工具台首页按分类展示工具卡片。
- 任务详情可展示推荐工具。
- 外链工具明显标识跳转。
- 内嵌工具使用 iframe 容器并限制权限。

