# 配置中心技术设计

## 1. 后端模块

Rust 模块建议：

```text
config
template
approval_rule
alert_rule
view_config
runtime_status
```

模块职责：

- 管理任务类型、项目类型、字段模板、分工模板。
- 管理审批规则、告警规则、资料要求。
- 管理首页视图、角色入口、邀请注册策略。
- 提供只读运行状态。
- 管理配置版本发布。

## 2. 核心表

### 2.1 config_version

字段：

- `id`。
- `namespace`。
- `version_no`。
- `status`：draft、published、disabled。
- `payload`。
- `created_by`。
- `published_by`。
- `published_at`。

### 2.2 task_template

字段：

- `id`。
- `task_type_id`。
- `fields_json`。
- `milestones_json`。
- `assignments_json`。
- `resource_requirements_json`。
- `acceptance_rules_json`。

### 2.3 approval_rule / alert_rule / view_config

规则类配置统一用 JSON payload 保存版本，同时保留关键字段做索引。

## 3. API

```text
GET  /api/config/modules
GET  /api/config/{namespace}
POST /api/config/{namespace}/draft
POST /api/config/{namespace}/publish
POST /api/config/{namespace}/disable
GET  /api/config/versions
GET  /api/config/runtime-status
```

## 4. 发布规则

- 草稿不影响线上。
- 发布后生成新版本。
- 任务模板只影响新任务。
- 权限、告警、角色入口、邀请策略可即时生效。
- 发布配置写审计日志。

## 5. 运行状态

运行状态页只读展示：

- 端口。
- 数据库连接。
- Redis 连接。
- 对象存储连接。
- 搜索后端。
- 构建版本。
- 启动时间。

不展示密钥和连接密码。

## 6. 前端实现

- 配置中心首页展示模块卡片和异常。
- 模板编辑器使用字段组件画布。
- 规则编辑器使用条件表达式表单。
- 配置发布需要二次确认。
- 运行状态页定时刷新。

