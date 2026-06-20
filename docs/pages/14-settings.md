# 设置 / 配置中心（Settings）

> 参考 Linear Settings 和 Notion Settings，将系统配置组织为清晰的分组设置页，强调变更留痕和即时生效。

## 1. 页面目标

集中维护系统全局配置，保证全局体验一致，避免每个页面单独写死规则。

## 2. 整体布局

```
┌────────────────────────────────────────────────────────────────┐
│  Settings                                                      │
├───────────────────────┬────────────────────────────────────────┤
│                       │                                        │
│  左侧设置菜单         │  右侧设置内容区                        │
│                       │                                        │
└───────────────────────┴────────────────────────────────────────┘
```

## 3. 左侧菜单

- General（通用）
- Organization & People（组织与人员）
- Roles & Permissions（角色与权限）
- Projects（项目配置）
- Tasks（任务类型与模板）
- Workflows & Approvals（工作流与审批）
- Alerts（告警规则）
- Files（资料类型）
- Home & Views（首页与视图）
- Tools（工具台）
- Invitations（邀请注册策略）
- System（系统参数）

## 4. 设置内容区

- 顶部搜索框，搜索配置项。
- 列表式展示配置项：名称、说明、当前值、状态、操作。
- 点击编辑进入抽屉/弹窗。

### 4.1 配置编辑抽屉 ASCII 图

```text
+--------------------------------------------------------+
| Edit Setting                                    X       |
| Tasks / Task Types / Default workflow                  |
+--------------------------------------------------------+
| Summary                                                |
| Name: 任务类型                                          |
| Scope: affects new tasks only                          |
| Current status: enabled                                |
+--------------------------------------------------------+
| Form                                                   |
| Label                     [ Input / Select / Switch ]  |
| Description               helper text                  |
| Validation error slot     error message if any         |
+--------------------------------------------------------+
| Impact preview                                         |
| - New tasks will use the updated template              |
| - Existing tasks keep their snapshot                   |
| - 3 saved views reference this field                   |
+--------------------------------------------------------+
| Change reason                                          |
| [ textarea required for important changes ]            |
+--------------------------------------------------------+
| Version / audit                                        |
| Last changed by Chen at 06-18 14:20                    |
| [View history] [Compare latest]                        |
+--------------------------------------------------------+
| Sticky actions                                         |
| [Cancel] [Save draft]                    [Publish]     |
+--------------------------------------------------------+
```

## 5. 复杂配置

- 工作流与审批：使用流程图编辑器（@xyflow/react）。
- 任务模板：使用表单构建器（@dnd-kit 拖拽字段）。
- 告警规则：使用条件规则组件。

## 6. 变更规则

- 权限规则变更即时生效。
- 模板变更只影响新建任务。
- 字典项停用后历史数据仍可展示。
- 重要变更记录操作日志。

## 7. 配置项分层

- General：系统名称、默认时区、日期格式、工作日规则。
- Organization & People：组织层级、人员字段、技能字典、工作状态字典。
- Roles & Permissions：角色、权限点、数据范围、隐藏项目授权规则。
- Projects：项目类型、项目级别、项目状态、归档策略。
- Tasks：任务类型、优先级、成果要求模板、分工字段。
- Workflows & Approvals：跨部门审批、强制安排审批、变更审批、验收流程。
- Alerts：延期、超载、冲突、资料缺失、审批超时规则。
- Home & Views：角色默认首页卡片、默认视图、默认筛选。

## 8. 编辑与发布流程

- 简单配置项修改后即时保存，但需要明确提示生效范围。
- 复杂配置（工作流、模板、权限）应支持草稿、预览、发布三步，发布前展示影响范围。
- 模板变更只影响新建任务；历史任务保留创建时模板快照。
- 字典项停用后不可再选择，但历史数据继续展示原名称，并标记“已停用”。
- 权限变更发布后需要刷新当前用户的权限缓存，必要时提示重新进入页面。
- 配置项保存失败时保留用户输入，不关闭抽屉/弹窗。

## 9. 审计与回滚

- 重要配置变更必须记录变更前值、变更后值、操作人、原因、时间。
- 权限和工作流配置建议支持版本查看和回滚；回滚本身也是一次新变更。
- 审计日志中应能从配置项跳转到对应 Settings 页面。
- 删除配置项优先做停用，不做硬删除；确需删除时必须检测历史引用。
- 多人同时编辑同一配置时，后保存者需要看到冲突提示和最新版本。

## 10. 当前落地切片：权限矩阵安全发布

- `/permissions` 作为 Roles & Permissions 的独立工作台，先把角色动作矩阵做成可审计的发布面板，而不是单纯勾选保存。
- 角色选择后必须展示角色详情摘要：角色编码、类型、启停状态、当前动作数、数据范围规则数、隐藏授权数、最近权限审计时间。
- 动作矩阵按模块分组展示，勾选变化即时计算“新增动作 / 移除动作 / 未变化动作”，保存前在右侧影响预览中明确展示。
- 高风险动作包括 `admin.manage`、`config.publish`、`person.manage`、`org.manage`、`project.manage`、`resource.download`、`report.export`；新增或移除这些动作时必须要求填写变更原因，并在保存按钮附近展示风险提示。
- 保存动作矩阵时前端提交 `{ actions, reason, impact }`；后端当前仍全量替换动作，但审计 payload 必须能回读变更原因和影响摘要。
- 权限审计页签必须支持本地筛选动作/对象/关键字，并提供详情面板展示 before/after、原因和原始 payload，避免审计列表只剩不可读 ID。
- 数据范围和隐藏授权仍保留现有创建/删除能力，但在角色详情摘要中参与影响计数，帮助管理员理解角色权限、数据范围和临时授权之间的关系。
- 失败时不清空已勾选矩阵；保存成功后刷新角色动作和审计列表，并提示“当前权限已即时生效，已登录用户可能需要重新进入页面刷新菜单”。

## 建议组件

配置中心是典型的“左侧导航 + 右侧表单”页面，组件选择要兼顾导航清晰度、表单一致性与复杂配置的可视化编辑。建议基础控件统一使用 **shadcn/ui**，并通过 CSS 变量映射到 NexusFlow 色板：页面背景 `--bg-primary`（#FAF9F7），左侧菜单 `--bg-secondary`（#FFFFFF），右侧内容区 `--bg-secondary`，菜单选中/悬浮 `--bg-tertiary`（#F5F4F2），边框 `--border-subtle`（rgba(0,0,0,0.05)），文字 `--text-primary`（#1A1A1A）/`--text-muted`（#7A7A7A）。开关、选中态统一使用 `--text-primary` 作为激活色，不引入额外强调色。

左侧设置菜单建议自研或使用 shadcn/ui `Sidebar`，包含 General、Organization & People、Roles & Permissions、Projects、Tasks、Workflows & Approvals、Alerts、Files、Home & Views、Tools、Invitations、System。菜单项高度 40px，选中背景 `--bg-tertiary`，左侧 3px `--text-primary` 竖线指示。菜单宽度默认 260px，可选使用 shadcn/ui `Resizable` 支持用户拖拽调整宽度，拖拽分隔线 `--border-subtle`。

右侧设置内容区顶部搜索框使用 shadcn/ui `Input`，占位符 `--text-muted`，用于搜索配置项。配置项列表使用 **TanStack Table** 或自研列表，每行展示名称、说明、当前值、状态、操作，行高 48px，hover 背景 `--bg-tertiary`，分割线 `--border-subtle`。点击编辑进入抽屉/弹窗：简单字段使用 shadcn/ui `Dialog`（居中），复杂字段使用 shadcn/ui `Sheet`（右侧 560px）。

表单编辑统一使用 **react-hook-form + zod** 做校验，表单控件使用 shadcn/ui `Form`、`Input`、`Switch`、`Select`、`Textarea`、`RadioGroup`、`Checkbox`。标签文字 `--text-primary`，说明文字 `--text-muted`，错误提示 `--error`。开关组件激活态背景 `--text-primary`，关闭态 `--bg-tertiary`。Select 下拉背景 `--bg-secondary`，选项 hover `--bg-tertiary`。

复杂配置中，**工作流与审批流**使用 **@xyflow/react** 绘制流程图编辑器。节点背景 `--bg-secondary`，边框 `--border-subtle`，选中边框 `--text-primary`，连线 `--text-muted`，条件节点使用 `--info`、审批节点使用 `--warning`、结束节点使用 `--success`，严格限制为语义色。侧边属性面板使用 shadcn/ui `Sheet`。开始/结束节点使用圆形，任务节点使用圆角矩形，条件节点使用菱形。

**任务模板表单构建器**使用 **@dnd-kit** 实现字段拖拽排序与增删。字段卡片背景 `--bg-secondary`，hover `--bg-tertiary`，拖拽占位 `--border-subtle` 虚线边框。字段类型选择使用 shadcn/ui `Select`，包括文本、数字、日期、选择、多选、附件等。

**告警规则**使用自研条件规则组件：条件行使用 shadcn/ui `Select` 组合，背景 `--bg-tertiary`，边框 `--border-subtle`；添加/删除条件按钮使用 shadcn/ui `Button` 的 `ghost`/`outline` 变体。规则可组合“且/或”条件。

重要变更（如权限规则变更、字典项停用）使用 shadcn/ui `AlertDialog` 二次确认，并记录操作日志。变更留痕在 Activity 或审计日志中查询。设置项变更建议即时生效（权限类）或明确提示生效范围（模板类），避免用户困惑。
