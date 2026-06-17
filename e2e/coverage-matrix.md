# 覆盖矩阵

| 模块 | 用例文件 | 页面覆盖 | API 覆盖 | 特别关注 |
| --- | --- | --- | --- | --- |
| 00 全局、登录、导航 | [00-global-auth-navigation.md](./cases/00-global-auth-navigation.md) | 登录、全局导航、搜索入口、移动端 | healthz、readyz、auth | 登录态、默认首页、退出、401 |
| 01 组织与人员 | [01-organization-personnel.md](./cases/01-organization-personnel.md) | 组织、人员、详情、编辑、技能 | orgs、users、skills | 组织树、人员负载、待审核入口 |
| 02 权限 | [02-permission.md](./cases/02-permission.md) | 角色、数据范围、隐藏授权、审计 | roles、permissions、visibility-grants、audit | 权限裁剪、即时生效、审计 |
| 03 任务管理 | [03-task-management.md](./cases/03-task-management.md) | 列表、新建、详情、分工、验收、日志 | tasks、assignments | 状态机、验收、资料校验 |
| 04 派发协同 | [04-dispatch-collaboration.md](./cases/04-dispatch-collaboration.md) | 派发向导、协调单、后补确认 | dispatch、approvals | 跨部门审批、调整、升级 |
| 05 负载与冲突 | [05-load-conflict.md](./cases/05-load-conflict.md) | 负载日历、冲突中心、详情抽屉 | workload、conflicts | 阻断规则、强制安排 |
| 06 资料库 | [06-resource-library.md](./cases/06-resource-library.md) | 资料列表、任务资料、详情、上传、版本 | resources | 上传、下载、版本、验收前检查 |
| 07 首页工作台 | [07-home-dashboard.md](./cases/07-home-dashboard.md) | 首页组件、SA 首页、移动端 | dashboard | 角色首页、待办跳转、权限入口 |
| 08 配置中心 | [08-config-center.md](./cases/08-config-center.md) | 配置模块、模板、审批、告警、运行状态 | config | 草稿、发布、停用、密钥隐藏 |
| 09 通知与报表 | [09-notification-report.md](./cases/09-notification-report.md) | 待办、通知、报表 | todos、notifications、reports | 跳转正确、指标口径 |
| 10 工具台 | [10-tool-center.md](./cases/10-tool-center.md) | 工具首页、详情、配置、记录 | tools | 上下文传递、使用记录、外链 |
| 11 项目管理 | [11-project-management.md](./cases/11-project-management.md) | 项目列表、详情、成员、任务、资料、授权 | projects | 隐藏项目、成员规则、统计 |
| 12 甘特与搜索 | [12-gantt-search.md](./cases/12-gantt-search.md) | 甘特、筛选、浮层、搜索 | gantt、search、saved-filters | 脱敏、保存筛选、移动端 |
| 13 SA 后台与邀请 | [13-admin-auth.md](./cases/13-admin-auth.md) | 邀请、注册、审核、账号安全、审计 | admin、invitations、register | 链接一次展示、待审核隔离 |

