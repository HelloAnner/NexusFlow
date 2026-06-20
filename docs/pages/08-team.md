# 团队 / 人员（Team）

> 参考 Float、Resource Guru 和 Wrike Workload，团队页面不仅是人员列表，更是资源调度中心。

## 1. 页面目标

帮助管理者查看团队成员的技能、负载、日程，快速找到合适人员并分配工作。

## 2. 整体布局

```
┌────────────────────────────────────────────────────────────────┐
│  Team                 [视图切换] [筛选] [ + 派任务 ]            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Main View（Grid / List / Workload / Calendar）                 │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Context Panel（点击人员后滑出）                                │
└────────────────────────────────────────────────────────────────┘
```

## 3. 视图切换

- **Grid**：人员卡片网格，展示头像、姓名、部门、技能、负载状态。
- **List**：高密度人员列表。
- **Workload**：人员负载热力图。
- **Calendar**：团队日程日历。

## 4. 人员卡片

- 头像、姓名、部门。
- 角色标签。
- 技能标签（最多 3 个）。
- 负载状态 badge（正常/警告/超载）。
- 当前任务数。
- 工作状态。
- hover 快捷操作：派任务 / 查看日程。

## 5. 负载视图

- 左侧人员列表，右侧日期矩阵。
- 每个单元格颜色表示负载强度。
- 全天任务/休假用置灰块。
- 超载日期红色高亮。
- 支持拖拽调整任务日期（需权限）。

## 6. 筛选

- 组织、角色、技能、项目、状态、负载状态。

## 7. 人员详情面板

点击人员后右侧面板展示：

- 人员档案。
- 当前任务。
- 负载日历。
- 所属项目。
- 技能标签。
- 资料贡献。
- 审计日志（管理员）。

### 7.1 人员详情面板 ASCII 图

```text
+------------------------------------------------------+
| Person Detail                                 X  Pin  |
|                                           [派任务] ... |
+------------------------------------------------------+
| Identity                                             |
| +--------+  Wang Lin                                 |
| |Avatar |  Research Dept / Senior Engineer           |
| +--------+  [在岗] [可派工] [技能: 建模, 数据, 评审]   |
+------------------------------------------------------+
| Capacity summary                                     |
| Workload this week [################----] 78%         |
| Today: 6h assigned / 8h available                     |
| Conflicts: 1 warning                                  |
+------------------------------------------------------+
| Tabs                                                 |
| Profile | Tasks | Workload | Projects | Files | Audit |
+------------------------------------------------------+
| Scrollable tab content                               |
|                                                      |
| Profile: phone / email / organization / roles        |
| Tasks: current task list with due and status          |
| Workload: mini heatmap + daily task breakdown         |
| Projects: active project cards                       |
| Files: contributed files in permission scope          |
| Audit: org/role/auth changes for admins              |
+------------------------------------------------------+
| Sticky actions                                       |
| [查看日程] [调整授权]                  [派任务]       |
+------------------------------------------------------+
```

## 8. 资源调度细节

- Team 默认不是通讯录，而是“可派工人员池”；默认排序按负载健康度、技能匹配度、近期可用性综合排序。
- 派任务入口从人员卡片触发时，新建任务默认带入该人员为成员或负责人，并在表单中展示其负载提示。
- Workload 视图中点击单元格展示该人员当天任务、休假、全天占用和冲突来源。
- 技能标签应来自统一字典，不能由前端自由输入；管理员可在 Settings 维护技能字典。
- 工作状态区分“在岗、休假、出差、不可派工、离职/停用”，不可派工人员不应出现在推荐候选人中。
- 跨部门派工时，人员卡片必须提示是否需要审批，而不是等到发布任务最后一步才暴露。

## 9. 权限与隐私

- 普通员工只能查看权限范围内的团队成员基础信息，不展示审计日志和敏感账号状态。
- 管理者可查看管辖范围内人员负载，但隐藏项目授权导致的任务应以脱敏块显示。
- SA 可查看和编辑全量人员资料，但修改组织、角色、账号状态必须填写原因。
- 人员详情中的资料贡献只展示当前用户有权限访问的文件。
- 离职或停用人员在历史任务中仍展示姓名和历史角色，但不可再被分配新任务。

## 10. 空态与异常

- 当前筛选无人员时，展示“清除筛选”和“调整组织范围”。
- 负载数据加载失败时，人员列表仍可用，负载列显示“暂不可用”。
- 日期矩阵横向滚动时，人员列必须固定，避免用户失去行上下文。
- 拖拽调整任务日期后，如果后端校验失败，任务回到原日期并展示具体冲突原因。

## 建议组件

团队页面需要从“人员列表”升级为“资源调度中心”，因此组件选择要兼顾展示与操作。基础控件统一使用 **shadcn/ui**，并通过 CSS 变量映射到 NexusFlow 色板：页面背景 `--bg-primary`（#FAF9F7），视图容器 `--bg-secondary`（#FFFFFF），卡片/行 hover 态 `--bg-tertiary`（#F5F4F2），边框 `--border-subtle`（rgba(0,0,0,0.05)），文字 `--text-primary`（#1A1A1A）/`--text-muted`（#7A7A7A）。负载状态虽涉及颜色，但必须严格使用语义色：`--success`（正常）、`--warning`（警告）、`--error`（超载），不引入新的热力色阶。

顶部视图切换使用 shadcn/ui `Tabs`：Grid / List / Workload / Calendar。筛选与 + 派任务按钮使用 shadcn/ui `Button` 与 `DropdownMenu`。筛选维度包括组织、角色、技能、项目、状态、负载状态。+ 派任务主按钮填充 `--text-primary`。

**Grid 视图**建议自研 **Person Card 组件**。卡片使用 shadcn/ui `Card` 包裹，背景 `--bg-secondary`，内部包含：shadcn/ui `Avatar`（尺寸 lg）、姓名（`text-primary font-medium`）、部门（`text-muted`）、角色标签与技能标签（shadcn/ui `Badge`，背景 `--bg-tertiary`、文字 `--text-primary`，不使用彩色 badge）、负载状态 badge（语义色：`--success`/`--warning`/`--error`）、当前任务数、工作状态。卡片使用 CSS Grid 响应式布局（桌面 4 列、平板 3 列、移动 2 列、小屏 1 列），hover 时 `translate-y-[-2px]`、阴影 `shadow-md`，过渡 200ms。hover 显示快捷操作：派任务 / 查看日程，使用 shadcn/ui `Button` 的 `ghost` 变体。

**List 视图**使用 **TanStack Table**，表头背景 `--bg-tertiary`，行分割线 `--border-subtle`，hover 行背景 `--bg-tertiary`。人员名字段展示 shadcn/ui `Avatar` + 姓名 + 部门，负载状态列使用语义色 badge。长列表使用 **TanStack Virtual**。

**Workload 视图**建议自研 **Workload Heatmap 组件**。左侧人员列固定，右侧日期矩阵横向滚动。单元格颜色按负载强度映射：空闲 `--bg-tertiary`、正常 `--success` 20% 透明度、警告 `--warning` 20% 透明度、超载 `--error` 20% 透明度、全天任务/休假使用 `--text-muted` 20% 透明度置灰。hover 单元格显示 shadcn/ui `Tooltip`，展示当天任务明细。支持拖拽调整任务日期时使用 **@dnd-kit**，拖拽占位边框 `--border-subtle` 虚线。矩阵支持按部门/角色分组折叠。

**Calendar 视图**使用 **react-big-calendar** 并完全自定义样式：月/周网格边框 `--border-subtle`，今天背景 `--bg-tertiary`，事件条背景按类型使用语义色或 `--text-primary`，全天事件使用 `--bg-tertiary` 边框。日期计算由 **date-fns** 处理。点击日期可查看当天任务详情。

人员详情面板使用 shadcn/ui `Sheet`（桌面 560px）或 **vaul**（移动端）。面板内包含人员档案、当前任务（复用 My Work List）、负载日历（复用 Workload 组件）、所属项目、技能标签、资料贡献、审计日志（管理员）。面板内所有组件保持与外部一致的色板。管理员修改人员组织/角色/授权时，必须使用 `AlertDialog` 要求填写原因并写入审计日志。负载计算由后端提供每日负载数据，前端按日期聚合渲染热力图。
