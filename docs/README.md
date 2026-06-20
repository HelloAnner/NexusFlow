# 工作管理系统产品设计文档

本目录包含工作管理系统的原始需求、总 PRD、按领域拆分的功能/技术设计，以及重构后的前端页面设计。

## 核心文档

| 文档 | 说明 |
| --- | --- |
| [origin-prd.md](origin-prd.md) | 原始需求描述 |
| [prd.md](prd.md) | 汇总版 PRD |
| [00-overview/README.md](00-overview/README.md) | 领域文档阅读入口 |
| [00-overview/architecture.md](00-overview/architecture.md) | Rust 后端、TS+Bun 前端、单二进制部署架构 |
| [00-overview/submodel-implementation.md](00-overview/submodel-implementation.md) | 各子模型的数据、服务、状态和实现边界 |

## 前端页面设计（重构后）

前端页面设计已按**国际一流工作管理产品**（Linear / Wrike / Notion / Figma / Slack / Monday.com / Asana）的信息架构与交互范式重新设计，强调：

- 工作上下文导航（Home / Inbox / My Work / Projects / Team / Schedule / Files / Reports）
- 右侧面板上下文（参考 Linear Issue Detail / Figma Right Panel）
- 键盘优先与命令面板（参考 Linear Cmd+K）
- 数据库式多视图切换（参考 Notion Database / Monday Board）
- 内联编辑与块编辑器（参考 Notion / Linear）

所有页面设计文档统一存放在 [pages/](pages/) 目录下，每个页面一个独立文件。

| 页面文件 | 核心参考 | 说明 |
| --- | --- | --- |
| [pages/00-design-principles.md](pages/00-design-principles.md) | Linear / Wrike / Notion | 重构设计原则与全局规范 |
| [pages/01-global-shell.md](pages/01-global-shell.md) | Linear + Slack | 全局导航、命令面板、搜索、快捷键 |
| [pages/02-home.md](pages/02-home.md) | Linear Today + Monday Dashboard | 今日工作台 |
| [pages/03-inbox.md](pages/03-inbox.md) | Linear Inbox + Slack Activity | 待办与通知收件箱 |
| [pages/04-my-work.md](pages/04-my-work.md) | Linear My Issues + Asana My Tasks | 我的工作 |
| [pages/05-projects.md](pages/05-projects.md) | Linear Projects + Wrike Spaces | 项目中心 |
| [pages/06-project-detail.md](pages/06-project-detail.md) | Linear Project View + Figma Panel | 项目详情右侧面板 |
| [pages/07-task-detail.md](pages/07-task-detail.md) | Linear Issue Detail + Figma Panel | 任务详情右侧面板 |
| [pages/08-team.md](pages/08-team.md) | Float + Resource Guru + Wrike Workload | 团队与资源 |
| [pages/09-schedule.md](pages/09-schedule.md) | Instagantt + Wrike Gantt + Linear Timeline | 排程中心 |
| [pages/10-conflicts.md](pages/10-conflicts.md) | Linear Triage + Wrike Risk | 冲突与风险中心 |
| [pages/11-files.md](pages/11-files.md) | Notion Files + Wrike Files | 资料库 |
| [pages/12-reports.md](pages/12-reports.md) | Monday Dashboard + Wrike Reports | 报表中心 |
| [pages/13-tools.md](pages/13-tools.md) | Notion Integrations + Wrike Apps | 工具台 |
| [pages/14-settings.md](pages/14-settings.md) | Linear Settings + Notion Settings | 配置中心 |
| [pages/15-admin.md](pages/15-admin.md) | Linear Admin + Wrike Account Settings | SA 后台 |
| [pages/16-task-create.md](pages/16-task-create.md) | Linear Cmd+N + Wrike Request Forms | 新建任务 |

## 领域文档

| 目录 | 说明 | 功能设计 | 技术设计 |
| --- | --- | --- | --- |
| [01-organization-personnel](01-organization-personnel/function-design.md) | 组织、人员、技能、项目归属 | [功能设计](01-organization-personnel/function-design.md) | [技术设计](01-organization-personnel/technical-design.md) |
| [02-permission](02-permission/function-design.md) | 角色权限、数据范围、隐藏项目 | [功能设计](02-permission/function-design.md) | [技术设计](02-permission/technical-design.md) |
| [03-task-management](03-task-management/function-design.md) | 任务模型、状态流、分工、验收 | [功能设计](03-task-management/function-design.md) | [技术设计](03-task-management/technical-design.md) |
| [04-dispatch-collaboration](04-dispatch-collaboration/function-design.md) | 派发、跨部门协调、后补填报 | [功能设计](04-dispatch-collaboration/function-design.md) | [技术设计](04-dispatch-collaboration/technical-design.md) |
| [05-load-conflict](05-load-conflict/function-design.md) | 负载计算、冲突规则、风险处理 | [功能设计](05-load-conflict/function-design.md) | [技术设计](05-load-conflict/technical-design.md) |
| [06-resource-library](06-resource-library/function-design.md) | 资料、版本、可见范围、归档 | [功能设计](06-resource-library/function-design.md) | [技术设计](06-resource-library/technical-design.md) |
| [07-home-dashboard](07-home-dashboard/function-design.md) | 首页组件、角色工作台、看板 | [功能设计](07-home-dashboard/function-design.md) | [技术设计](07-home-dashboard/technical-design.md) |
| [08-config-center](08-config-center/function-design.md) | 任务模板、审批、告警、视图配置 | [功能设计](08-config-center/function-design.md) | [技术设计](08-config-center/technical-design.md) |
| [09-notification-report](09-notification-report/function-design.md) | 通知、待办、报表指标 | [功能设计](09-notification-report/function-design.md) | [技术设计](09-notification-report/technical-design.md) |
| [10-tool-center](10-tool-center/function-design.md) | 工具台、智能体工具、上下文传递 | [功能设计](10-tool-center/function-design.md) | [技术设计](10-tool-center/technical-design.md) |
| [11-project-management](11-project-management/function-design.md) | 项目模型、项目成员、隐藏项目、项目归档 | [功能设计](11-project-management/function-design.md) | [技术设计](11-project-management/technical-design.md) |
| [12-gantt-search](12-gantt-search/function-design.md) | 甘特图、全局搜索、权限裁剪 | [功能设计](12-gantt-search/function-design.md) | [技术设计](12-gantt-search/technical-design.md) |
| [13-admin-auth](13-admin-auth/function-design.md) | SA 后台、邀请注册、账号安全、角色入口 | [功能设计](13-admin-auth/function-design.md) | [技术设计](13-admin-auth/technical-design.md) |

## 使用建议

- 产品评审先看 `prd.md` 和 `00-overview`。
- 前端交互与信息架构评审重点看 `pages/00-design-principles.md` 和 `pages/01-global-shell.md`。
- 技术评审重点看 `00-overview/architecture.md` 和 `00-overview/submodel-implementation.md`。
- 研发拆任务时按领域目录进入功能设计和技术设计，按页面文件进入前端实现。
- 后端功能与数据模型以 `function-design.md` 和 `technical-design.md` 为准，前端重构不改变后端契约。
- 账号邀请、权限、项目、任务、派发、负载、甘特图、配置是主链路，开发前建议一起评审。
