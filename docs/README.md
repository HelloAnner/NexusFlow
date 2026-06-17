# 工作管理系统产品设计文档

本目录包含工作管理系统的原始需求、总 PRD 和按领域拆分的详细功能/页面设计。

## 核心文档

| 文档 | 说明 |
| --- | --- |
| [origin-prd.md](origin-prd.md) | 原始需求描述 |
| [prd.md](prd.md) | 汇总版 PRD |
| [00-overview/README.md](00-overview/README.md) | 领域文档阅读入口 |
| [00-overview/architecture.md](00-overview/architecture.md) | Rust 后端、TS+Bun 前端、单二进制部署架构 |
| [00-overview/submodel-implementation.md](00-overview/submodel-implementation.md) | 各子模型的数据、服务、状态和实现边界 |

## 领域文档

| 目录 | 说明 | 页面设计 | 技术设计 |
| --- | --- | --- | --- |
| [01-organization-personnel](01-organization-personnel/function-design.md) | 组织、人员、技能、项目归属 | [页面设计](01-organization-personnel/page-design.md) | [技术设计](01-organization-personnel/technical-design.md) |
| [02-permission](02-permission/function-design.md) | 角色权限、数据范围、隐藏项目 | [页面设计](02-permission/page-design.md) | [技术设计](02-permission/technical-design.md) |
| [03-task-management](03-task-management/function-design.md) | 任务模型、状态流、分工、验收 | [页面设计](03-task-management/page-design.md) | [技术设计](03-task-management/technical-design.md) |
| [04-dispatch-collaboration](04-dispatch-collaboration/function-design.md) | 派发、跨部门协调、后补填报 | [页面设计](04-dispatch-collaboration/page-design.md) | [技术设计](04-dispatch-collaboration/technical-design.md) |
| [05-load-conflict](05-load-conflict/function-design.md) | 负载计算、冲突规则、风险处理 | [页面设计](05-load-conflict/page-design.md) | [技术设计](05-load-conflict/technical-design.md) |
| [06-resource-library](06-resource-library/function-design.md) | 资料、版本、可见范围、归档 | [页面设计](06-resource-library/page-design.md) | [技术设计](06-resource-library/technical-design.md) |
| [07-home-dashboard](07-home-dashboard/function-design.md) | 首页组件、角色工作台、看板 | [页面设计](07-home-dashboard/page-design.md) | [技术设计](07-home-dashboard/technical-design.md) |
| [08-config-center](08-config-center/function-design.md) | 任务模板、审批、告警、视图配置 | [页面设计](08-config-center/page-design.md) | [技术设计](08-config-center/technical-design.md) |
| [09-notification-report](09-notification-report/function-design.md) | 通知、待办、报表指标 | [页面设计](09-notification-report/page-design.md) | [技术设计](09-notification-report/technical-design.md) |
| [10-tool-center](10-tool-center/function-design.md) | 工具台、智能体工具、上下文传递 | [页面设计](10-tool-center/page-design.md) | [技术设计](10-tool-center/technical-design.md) |
| [11-project-management](11-project-management/function-design.md) | 项目模型、项目成员、隐藏项目、项目归档 | [页面设计](11-project-management/page-design.md) | [技术设计](11-project-management/technical-design.md) |
| [12-gantt-search](12-gantt-search/function-design.md) | 甘特图、全局搜索、权限裁剪 | [页面设计](12-gantt-search/page-design.md) | [技术设计](12-gantt-search/technical-design.md) |
| [13-admin-auth](13-admin-auth/function-design.md) | SA 后台、邀请注册、账号安全、角色入口 | [页面设计](13-admin-auth/page-design.md) | [技术设计](13-admin-auth/technical-design.md) |

## 使用建议

- 产品评审先看 `prd.md` 和 `00-overview`。
- 技术评审重点看 `00-overview/architecture.md` 和 `00-overview/submodel-implementation.md`。
- 研发拆任务时按领域目录进入功能设计、页面设计和技术设计。
- 账号邀请、权限、项目、任务、派发、负载、甘特图、配置是主链路，开发前建议一起评审。
- 后续新增模块时，保持每个领域至少包含 `function-design.md` 和 `page-design.md`。
