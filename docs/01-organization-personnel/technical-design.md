# 组织与人员技术设计

## 1. 后端模块

Rust 模块建议：

```text
organization
personnel
skill
membership
```

模块职责：

- 维护组织树、组织负责人、默认审批人。
- 维护人员档案、账号绑定、工作状态和工时。
- 维护技能标签和人员标签关系。
- 维护人员项目归属和工作室归属。
- 为权限、任务派发、负载计算和人员选择器提供基础查询。

## 2. 核心表

### 2.1 organization

字段：

- `id`。
- `name`。
- `code`。
- `org_type`。
- `parent_id`。
- `path`。
- `leader_ids`。
- `deputy_leader_ids`。
- `technical_supervisor_ids`。
- `default_approver_ids`。
- `enabled`。
- `created_at`、`updated_at`。

索引：

- `code` 唯一索引。
- `parent_id` 普通索引。
- `path` 前缀查询索引。
- `org_type` 普通索引。

### 2.2 person

字段：

- `id`。
- `name`。
- `employee_no`。
- `account_id`。
- `primary_org_id`。
- `management_level`。
- `professional_level`。
- `work_status`。
- `daily_standard_hours`。
- `dispatch_enabled`。
- `account_status`。
- `default_entry_role_id`。
- `invitation_id`。
- `created_at`、`updated_at`。

索引：

- `employee_no` 唯一索引，允许为空时需部分唯一。
- `account_id` 唯一索引。
- `primary_org_id` 普通索引。
- `work_status` 普通索引。

### 2.3 person_org_membership

用于工作室等多归属。

字段：

- `person_id`。
- `org_id`。
- `membership_type`：primary、studio。
- `joined_at`。
- `left_at`。
- `active`。

### 2.4 skill_tag / person_skill_tag

技能标签与人员关系表。

## 3. API

```text
GET    /api/orgs/tree
POST   /api/orgs
PATCH  /api/orgs/{id}
POST   /api/orgs/{id}/disable

GET    /api/users
GET    /api/users/{id}
POST   /api/users
PATCH  /api/users/{id}
POST   /api/users/{id}/disable
GET    /api/users/{id}/workload-summary

GET    /api/skills
POST   /api/skills
PATCH  /api/skills/{id}
POST   /api/skills/{id}/disable
```

## 4. 权限

- SA 可查看和维护全部组织、人员和技能标签。
- 系统管理员按授权组织范围维护。
- 部门主任可查看和维护本部门人员的非敏感字段。
- 普通员工只能查看本人基础信息、项目归属、任务和资料贡献。
- 修改组织、角色、账号状态、隐藏项目授权必须进入权限审计。

## 5. 业务规则

- 人员必须有一个主组织。
- 主组织变更写入历史记录，不修改历史任务快照。
- 工作室归属可多选。
- 人员离职或账号禁用后，不可再作为新任务负责人或成员。
- 每日标准工时必须大于 0。
- 邀请注册人员如果待审核，不进入人员选择器。

## 6. 事件

发布事件：

- `organization.created`。
- `organization.updated`。
- `organization.disabled`。
- `person.created`。
- `person.updated`。
- `person.disabled`。
- `person.skill_changed`。
- `person.membership_changed`。

消费方：

- 权限模块刷新数据范围缓存。
- 负载模块刷新人员状态和容量。
- 搜索模块更新人员索引。
- 首页模块刷新人员和组织统计。

## 7. 缓存

Redis 缓存：

- 组织树。
- 用户组织路径。
- 人员基础信息摘要。
- 技能标签字典。

缓存失效：

- 组织变更。
- 人员主组织变更。
- 技能标签变更。

## 8. 前端实现

页面：

- 组织管理页使用树 + 详情布局。
- 人员列表使用服务端分页、筛选和排序。
- 人员详情页通过页签懒加载任务、负载、项目和历史记录。
- 人员编辑页按权限隐藏不可编辑字段。

人员选择器：

- 支持按组织、技能、项目、负载、状态筛选。
- 展示可派发状态和本周负载。
- 待审核、离职、禁用人员默认不可选。

