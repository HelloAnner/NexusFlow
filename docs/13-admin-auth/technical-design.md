# SA 后台、账号与邀请注册技术设计

## 1. 后端模块

Rust 模块建议：

```text
auth
account
invitation
registration
admin
role_entry
```

模块职责：

- 登录、退出、会话管理。
- 管理账号状态。
- 管理邀请模板和邀请链接。
- 处理邀请注册和审核。
- 提供 SA 后台首页。
- 配置角色默认入口。

## 2. 核心表

### 2.1 account

字段：

- `id`。
- `login_name`。
- `password_hash`。
- `person_id`。
- `status`：pending、enabled、disabled、locked。
- `last_login_at`。
- `failed_login_count`。

### 2.2 invitation_template

字段：

- `id`。
- `name`。
- `invite_type`。
- `default_org_id`。
- `default_role_ids`。
- `default_project_id`。
- `default_project_role`。
- `default_work_desc`。
- `need_approval`。
- `reviewer_source`。
- `required_fields`。
- `expires_in_days`。
- `max_uses`。
- `status`。

### 2.3 invitation_link

字段：

- `id`。
- `template_id`。
- `token_hash`。
- `expires_at`。
- `max_uses`。
- `used_count`。
- `status`。
- `created_by`。

### 2.4 registration_request

字段：

- `id`。
- `invitation_link_id`。
- `account_id`。
- `person_id`。
- `payload`。
- `status`。
- `reviewer_id`。
- `review_comment`。

## 3. API

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

GET  /api/invitations/templates
POST /api/invitations/templates
PATCH /api/invitations/templates/{id}
POST /api/invitations/templates/{id}/links
GET  /api/invitations/links
POST /api/invitations/links/{id}/disable

GET  /api/register/invitation/{token}
POST /api/register/invitation/{token}
GET  /api/admin/registrations
POST /api/admin/registrations/{id}/approve
POST /api/admin/registrations/{id}/reject

GET  /api/admin/dashboard
GET  /api/admin/accounts
POST /api/admin/accounts/{id}/disable
POST /api/admin/accounts/{id}/unlock
```

## 4. 邀请 token

规则：

- token 使用高强度随机值。
- 数据库只保存 token 哈希。
- 完整链接只在生成时展示一次。
- 链接有有效期和使用次数。
- 访问注册页时校验 token、状态、有效期、次数和模板状态。

## 5. 注册事务

注册提交必须在事务中完成：

1. 锁定邀请链接。
2. 校验使用次数。
3. 创建或绑定账号。
4. 创建或更新人员档案。
5. 写入组织、角色、项目归属。
6. 创建注册申请或直接启用。
7. 增加已使用次数。
8. 写审计日志。

## 6. 权限

- SA 可管理全部账号、邀请和人员全量字段。
- 授权管理员只能管理授权组织范围内邀请模板。
- 待审核用户无业务数据权限。
- SA 敏感访问隐藏项目和个人事项必须审计。

## 7. 事件

发布：

- `invitation.created`。
- `invitation.disabled`。
- `registration.submitted`。
- `registration.approved`。
- `registration.rejected`。
- `account.disabled`。
- `role_entry.updated`。

消费：

- 通知待办模块生成审核待办。
- 权限模块刷新用户权限。
- 首页模块刷新 SA 待办。
- 审计模块记录敏感操作。

## 8. 前端实现

- 邀请注册页根据 token 加载模板摘要。
- 注册表单字段由模板配置驱动。
- SA 后台首页聚合待审核、邀请、运行状态和审计风险。
- 邀请链接复制后只展示脱敏 token。
- 人员全量编辑页按字段分组并要求敏感操作填写原因。

