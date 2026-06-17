# 子模型实现设计

## 1. 设计目标

本文把产品领域拆成可实现的后端子模型，说明每个子模型的核心实体、关系、状态、服务、事件和实现要点。实现时可以按 Rust module 或 crate 组织，但业务边界应保持稳定。

推荐后端模块：

```text
auth
invitation
admin
organization
personnel
project
permission
task
dispatch
load_conflict
resource
gantt_search
config
notification_report
tool_center
audit
```

## 2. 通用字段

所有主业务表建议包含：

- `id`：UUID。
- `created_at`。
- `created_by`。
- `updated_at`。
- `updated_by`。
- `deleted_at`：软删除。
- `version`：乐观锁版本。

所有状态变更建议写入对应日志表，审计日志另行记录敏感操作。

## 3. 账号、邀请与 SA 子模型

### 3.1 实体

- `account`：登录账号。
- `session`：登录会话。
- `invitation_template`：邀请模板。
- `invitation_link`：邀请链接。
- `registration_request`：注册申请。
- `role_entry_config`：角色入口配置。
- `admin_operation_log`：SA 后台操作日志。

账号关键字段：

- `login_name`。
- `password_hash`。
- `person_id`。
- `account_status`：待审核、启用、禁用、锁定。
- `last_login_at`。
- `failed_login_count`。

邀请模板关键字段：

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

邀请链接关键字段：

- `template_id`。
- `token_hash`。
- `created_by`。
- `expires_at`。
- `max_uses`。
- `used_count`。
- `status`。

### 3.2 规则

- SA 超级管理员拥有系统初始化和全局兜底管理能力。
- SA 默认不参与普通任务派发、审批和验收。
- 邀请 token 只保存哈希，完整链接只在生成时展示一次。
- 注册后根据邀请模板自动绑定组织、角色、项目身份和负责工作。
- 需要审核的注册用户只能访问完善资料和审核状态页。
- 邀请模板引用的组织、角色或项目停用后，模板和链接不可继续使用。
- 修改账号状态、角色、组织、隐藏项目授权必须写入审计。

### 3.3 服务

- 登录。
- 退出。
- 生成邀请模板。
- 生成邀请链接。
- 校验邀请链接。
- 提交注册。
- 审核注册。
- 绑定已有账号。
- 禁用或解锁账号。
- 配置角色默认入口。
- 查询 SA 后台首页。

## 4. 组织子模型

### 4.1 实体

- `organization`：组织节点。
- `organization_history`：组织变更历史。

关键字段：

- `name`。
- `code`。
- `org_type`：公司、二级单位、三级单位/中心、部门、创新工作室。
- `parent_id`。
- `path`：物化路径，便于范围查询。
- `leader_ids`。
- `deputy_leader_ids`。
- `technical_supervisor_ids`。
- `default_approver_ids`。
- `enabled`。

### 4.2 规则

- 公司、二级单位、三级单位/中心、部门构成主组织树。
- 创新工作室允许横向归属，不替代主组织。
- 组织移动或负责人调整必须记录历史。
- 历史任务展示创建时的组织快照。

### 4.3 服务

- 创建组织。
- 更新组织。
- 移动组织。
- 停用组织。
- 查询组织树。
- 生成组织快照。

## 5. 人员子模型

### 5.1 实体

- `person`：人员档案。
- `person_org_membership`：人员组织关系。
- `person_project_membership`：人员项目归属。
- `skill_tag`：技能标签。
- `person_skill_tag`：人员标签关系。
- `person_status_calendar`：人员状态日历。

关键字段：

- `name`。
- `account`。
- `employee_no`。
- `primary_org_id`。
- `management_level`。
- `professional_level`。
- `system_role_ids`。
- `work_status`。
- `daily_standard_hours`。

### 5.2 规则

- 每个人必须有一个主组织。
- 可加入多个创新工作室。
- 可归属多个项目。
- 管理等级和专业等级用于展示、筛选和统计。
- 系统角色决定操作权限。
- 休假、出差、培训可由任务自动写入状态日历。
- 邀请注册可自动创建人员档案或绑定已有人员。
- SA 可维护人员全部字段。

### 5.3 服务

- 创建人员。
- 更新人员档案。
- 维护技能标签。
- 维护项目归属。
- 查询人员负载摘要。
- 查询人员可派发状态。

## 6. 项目子模型

### 6.1 实体

- `project`：项目。
- `project_member`：项目成员。
- `project_visibility_grant`：隐藏项目授权。
- `project_snapshot`：项目快照。

关键字段：

- `project_no`。
- `name`。
- `project_type`：科研、市场、内部专项、其他。
- `level`：公司级、处级、中心级、项目自定义。
- `owner_org_id`。
- `leader_id`。
- `status`：筹备、进行中、暂停、完成、归档。
- `visibility`：普通、隐藏、指定范围。
- `start_date`。
- `end_date`。

### 6.2 规则

- 项目是任务的归属和统计口径，不替代任务。
- 项目负责人只能派发项目相关工作。
- 外部门人员加入项目任务仍需目标部门资源审批。
- 隐藏项目必须显式授权。
- 项目成员关系需要记录项目身份和负责工作。

### 6.3 服务

- 创建项目。
- 维护项目成员。
- 维护隐藏项目授权。
- 查询项目任务。
- 查询项目甘特图。
- 生成项目统计。

## 7. 权限子模型

### 7.1 实体

- `role`。
- `permission_action`。
- `role_action`。
- `data_scope_rule`。
- `visibility_grant`。
- `permission_audit_log`。

### 7.2 规则

权限由三层共同决定：

```text
操作权限 + 数据范围 + 对象状态
```

数据范围由组织范围、项目范围、任务可见性取交集。隐藏项目和个人事项必须在查询阶段裁剪。

### 7.3 服务

- 判断对象是否可见。
- 判断动作是否可执行。
- 生成列表查询过滤条件。
- 写入权限审计。
- 刷新权限缓存。

## 8. 任务子模型

### 8.1 实体

- `task`。
- `task_member`。
- `task_assignment`：分工。
- `task_milestone`。
- `task_progress_report`。
- `task_change_log`。
- `task_acceptance`。
- `task_archive`。

### 8.2 状态

任务状态：

```text
草稿 -> 待协调 -> 待确认 -> 进行中 -> 待验收 -> 已完成 -> 已归档
                  |        |        |
                  |        |        -> 验收退回 -> 进行中
                  |        -> 已暂停/有风险
                  -> 已取消
```

分工状态：

```text
未开始 -> 进行中 -> 待确认 -> 已完成
          |        |
          |        -> 退回修改 -> 进行中
          -> 阻塞/延期
```

### 8.3 规则

- 草稿不占用正式工时。
- 任务发布前必须完成权限、冲突和审批检查。
- 成员必须有工作内容、时间和投入。
- 分工不得超出任务周期。
- 任务概述、时间、成员、投入和成果要求变更必须留痕。
- 归档后默认只读。

### 8.4 服务

- 创建任务草稿。
- 提交任务。
- 发布任务。
- 创建分工。
- 更新进度。
- 提交验收。
- 验收通过或退回。
- 归档任务。
- 取消任务。

## 9. 派发协同子模型

### 9.1 实体

- `dispatch_request`。
- `approval_ticket`。
- `approval_step`。
- `approval_comment`。
- `coordination_meeting_record`。

### 9.2 规则

- 跨部门派发生成协调单。
- 负载冲突可生成协调单。
- 隐藏项目未授权生成授权审批。
- 强制安排必须由具备权限的管理者操作并填写原因。
- 原始需求中的“会议研讨”落地为协调记录，可记录会议时间、参会人、结论和附件。

### 9.3 服务

- 创建协调单。
- 审批通过。
- 审批拒绝。
- 调整投入后通过。
- 调整周期后通过。
- 推荐其他人员。
- 升级审批。
- 记录会议研讨结论。

## 10. 负载与冲突子模型

### 10.1 实体

- `workload_snapshot`。
- `conflict_record`。
- `risk_record`。
- `capacity_rule`。

### 10.2 负载公式

```text
某人某日负载率 = 当日所有生效任务预计投入小时总和 / 每日标准工时
```

预测完成口径：

```text
剩余工时 = 预计总工时 - 已确认投入工时
可用工时 = 截止日前每个工作日可用容量之和
如果 剩余工时 > 可用工时，则产生截止风险
预测完成日 = 从当前日期起按每日可用容量抵扣剩余工时后的日期
延期天数 = 预测完成日 - 截止日期
```

### 10.3 冲突类型

- 工时超载。
- 全天重叠。
- 休假冲突。
- 出差冲突。
- 培训冲突。
- 跨部门未审批。
- 隐藏项目未授权。
- 截止风险。

### 10.4 服务

- 预估任务草案负载。
- 计算正式负载。
- 生成冲突。
- 更新冲突状态。
- 生成处理建议。
- 写入负载快照。

## 11. 资料子模型

### 11.1 实体

- `resource_file`。
- `resource_version`。
- `resource_link`。
- `resource_requirement`。
- `resource_archive_record`。

### 11.2 规则

- 文件内容存对象存储，元数据存 PostgreSQL。
- 资料可关联任务、分工、项目。
- 资料可标记为阶段成果或最终成果。
- 验收前校验必需资料。
- 归档后资料版本锁定。
- 隐藏项目资料继承项目和任务可见性。

### 11.3 服务

- 申请上传。
- 完成上传。
- 创建版本。
- 关联任务或分工。
- 校验必需资料。
- 归档资料。
- 生成下载预签名 URL。

## 12. 甘特与搜索子模型

### 12.1 实体

- `gantt_view_preference`。
- `search_index_meta`。
- `saved_filter`。

### 12.2 甘特数据来源

甘特图不单独保存业务事实，按任务、分工、项目、人员负载实时查询或读取缓存。

甘特条目包括：

- 项目条。
- 任务条。
- 分工条。
- 人员占用条。
- 里程碑点。
- 冲突标记。
- 审批状态标记。

### 12.3 搜索范围

一期使用 PostgreSQL 全文检索：

- 任务：名称、编号、概述、负责人、成员。
- 人员：姓名、组织、技能、项目。
- 项目：名称、编号、负责人、成员。
- 资料：名称、类型、任务、上传人。

搜索结果必须先做权限裁剪，再返回标题、摘要和跳转地址。

## 13. 配置子模型

### 13.1 实体

- `config_namespace`。
- `config_version`。
- `task_type_config`。
- `task_template`。
- `approval_rule`。
- `alert_rule`。
- `view_config`。
- `tool_config`。
- `invitation_policy`。
- `role_entry_config`。

### 13.2 规则

- 配置有草稿、已发布、已停用状态。
- 任务模板发布后只影响新任务。
- 权限规则和告警规则可即时生效。
- 历史任务保留创建时配置快照。

### 13.3 服务

- 保存配置草稿。
- 发布配置。
- 停用配置。
- 查询有效配置。
- 生成任务模板快照。

## 14. 通知与报表子模型

### 14.1 实体

- `todo_item`。
- `notification`。
- `notification_delivery`。
- `report_snapshot`。
- `metric_definition`。

### 14.2 规则

- 待办必须能跳到具体处理位置。
- 通知不得泄露未授权隐藏项目标题和摘要。
- 报表明细必须遵守权限。
- 汇总指标可以按授权范围统计。

### 14.3 服务

- 创建待办。
- 完成待办。
- 发送通知。
- 生成报表快照。
- 查询报表指标。

## 15. 工具台子模型

### 15.1 实体

- `tool_entry`。
- `tool_permission`。
- `tool_usage_log`。
- `tool_context_policy`。

### 15.2 规则

- 工具分为常用工具和智能体工具。
- 外链工具必须标识跳转。
- 内嵌工具必须配置 CSP 和可用域名。
- 隐藏项目上下文不得传给未授权工具或未授权用户。
- 文件类工具通过对象存储交换输入和输出。

### 15.3 服务

- 创建工具入口。
- 配置工具可见范围。
- 记录工具使用。
- 生成工具上下文。
- 校验上下文脱敏规则。

## 16. 审计子模型

审计横跨所有模块。

必须审计：

- 登录和退出。
- 邀请模板和邀请链接变更。
- 注册提交和审核。
- 权限变更。
- 组织和人员变更。
- 项目隐藏授权。
- 任务派发、变更、强制安排。
- 审批通过和拒绝。
- 资料下载和归档。
- 配置发布。
- 报表导出。

审计日志字段：

- 操作人。
- 操作时间。
- 操作对象类型。
- 操作对象 ID。
- 操作动作。
- 变更前后摘要。
- 来源 IP。
- 请求 ID。

## 17. 领域事件

领域事件用于模块解耦、通知待办、缓存刷新和报表预计算。事件先写入 PostgreSQL 事件表，再由后端任务投递到 Redis 轻量队列，保证重试和可追溯。

核心事件：

- `organization.updated`：组织结构或负责人变化。
- `invitation.created`：邀请链接生成。
- `registration.submitted`：用户提交注册。
- `registration.approved`：注册审核通过。
- `account.disabled`：账号被禁用。
- `person.updated`：人员组织、角色、状态或技能变化。
- `project.created`：项目创建。
- `project.member_changed`：项目成员或项目身份变化。
- `project.visibility_changed`：隐藏项目授权变化。
- `task.created`：任务创建。
- `task.submitted`：任务提交协调或确认。
- `task.started`：任务进入进行中。
- `task.changed`：任务概述、时间、成员、投入或成果要求变化。
- `task.acceptance_requested`：任务提交验收。
- `task.accepted`：任务验收通过。
- `task.rejected`：任务验收退回。
- `task.archived`：任务归档。
- `assignment.progress_reported`：成员填报分工进度。
- `approval.requested`：生成审批或协调单。
- `approval.completed`：审批通过、拒绝或调整后通过。
- `conflict.detected`：生成冲突。
- `conflict.resolved`：冲突处理完成。
- `resource.uploaded`：资料上传完成。
- `resource.archived`：资料归档。
- `config.published`：配置发布。

事件处理：

- 通知模块消费任务、审批、冲突、资料事件生成待办和通知。
- 甘特图和首页缓存消费任务、人员、项目、冲突事件做失效。
- 报表模块消费任务、项目、资料、冲突事件做快照更新。
- 搜索模块消费任务、项目、人员、资料事件更新全文索引。

事件要求：

- 每个事件包含事件 ID、事件类型、对象类型、对象 ID、操作者、发生时间和 payload。
- 消费者必须幂等。
- 事件失败应记录重试次数和最后错误。
