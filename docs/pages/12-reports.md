# 报表中心（Reports）

> 参考 Monday.com Dashboards 和 Wrike Reports，将分散的数据聚合成可配置的数据洞察页面。

## 1. 页面目标

为不同角色提供项目、人员、风险、资料的数据洞察，支持自定义 Dashboard 和预置报表。

## 2. 整体布局

```
┌────────────────────────────────────────────────────────────────┐
│  Reports              [报表库] [我的 Dashboard ] [ + New ]      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Dashboard 网格                                                │
│  （Widget：统计卡片 / 图表 / 列表 / 甘特摘要）                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## 3. 预置报表

- 中心任务总览
- 部门任务总览
- 人员负载排行
- 延期任务清单
- 重点任务进度
- 跨部门协调统计
- 资料归档完整率
- 风险趋势

## 4. Dashboard Widget

- 统计卡片：数字 + 趋势。
- 柱状图/饼图：按状态/类型/部门分布。
- 列表：Top N 风险任务/超载人员。
- 甘特摘要：重点项目时间线。

### 4.1 Widget 配置面板 ASCII 图

```text
+----------------------------------------------------------+
| Widget Settings                                   X       |
| Dashboard / Risk trend                             More   |
+----------------------------------------------------------+
| Widget identity                                           |
| Title           [风险趋势                            ]     |
| Type            [Line chart v]                            |
| Data source     [Conflicts v]                             |
+----------------------------------------------------------+
| Data scope                                                |
| Time range      [Last 30 days v]                          |
| Organization    [Current department v]                    |
| Projects        [All visible projects v]                  |
| People          [All visible people v]                    |
+----------------------------------------------------------+
| Metrics / dimensions                                      |
| Metric          [Conflict count v]                        |
| Dimension       [Risk level v]                            |
| Group by        [Week v]                                  |
+----------------------------------------------------------+
| Preview                                                   |
| +------------------------------------------------------+   |
| | chart skeleton / live preview                         |   |
| +------------------------------------------------------+   |
+----------------------------------------------------------+
| Data definition                                           |
| Shows conflicts by created time, not resolved time.        |
| Last refreshed: 06-20 09:30                               |
+----------------------------------------------------------+
| Sticky actions                                            |
| [Remove widget] [Cancel]                    [Save widget] |
+----------------------------------------------------------+
```

## 5. 筛选

- 时间范围。
- 组织范围。
- 项目范围。
- 人员范围。

## 6. 导出

- 支持导出为 PDF / Excel / 图片。

## 7. 报表使用细节

- 报表中心默认按角色给出不同首页：员工看个人完成情况，负责人看项目推进，管理者看组织负载与风险，SA 看系统数据。
- 预置报表必须可复制为个人 Dashboard，用户可以在副本上调整筛选和 Widget，不影响全局模板。
- Widget 点击应能下钻到来源列表，例如延期任务数点击后进入 My Work 或 Projects 的延期筛选。
- Dashboard 级筛选会影响所有 Widget；Widget 自身筛选优先级更高，并在 Widget 标题旁显示筛选标记。
- 报表库中的每个报表需要说明数据口径和更新时间，避免用户误解实时性。

## 8. 数据口径

- 任务完成率需要明确分母是否包含已归档、已取消、草稿任务。
- 人员负载排行默认排除休假和不可派工人员，但可以通过筛选包含。
- 风险趋势按冲突创建时间统计，已解决状态作为第二条指标，不覆盖原始风险发生时间。
- 资料归档完整率按“必需资料已确认 / 必需资料总数”计算，而不是文件上传数量。
- 跨部门协调统计需区分发起数、通过数、拒绝数、平均处理时长。

## 9. 权限与导出

- 用户只能看到其权限范围内的数据聚合；没有权限的项目不能通过报表反推出名称或数量明细。
- 导出使用当前用户权限重新校验，不能只导出前端已加载数据。
- PDF/图片导出保留当前筛选、图表状态和时间戳；Excel 导出包含数据口径说明 Sheet。
- 大报表生成超过 5 秒时进入后台任务，完成后通过 Inbox 通知用户下载。
- 分享 Dashboard 时默认只分享布局和筛选，不提升接收者数据权限。

## 建议组件

报表中心是可配置的数据洞察页面，视觉风格需要克制，避免图表默认彩色主题破坏整体色调。建议基础控件使用 **shadcn/ui**，并通过 CSS 变量将 `Card`、`Tabs`、`Button`、`Select`、`Popover`、`Skeleton` 映射到 NexusFlow 色板：Dashboard 背景 `--bg-primary`（#FAF9F7），Widget 卡片 `--bg-secondary`（#FFFFFF），边框 `--border-subtle`（rgba(0,0,0,0.05)），文字 `--text-primary`（#1A1A1A）/`--text-muted`（#7A7A7A）。所有图表必须关闭默认主题，统一使用中性色与语义色。

顶部导航使用 shadcn/ui `Tabs`：报表库 / 我的 Dashboard / + New。+ New 按钮填充 `--text-primary`。报表库展示预置报表卡片网格，我的 Dashboard 展示用户自定义 Widget。筛选时间范围/组织范围/项目范围/人员范围使用 `Select` 与 `Popover`。

Dashboard Widget 建议使用自研 **Dashboard Grid 组件**，默认采用 CSS Grid 响应式布局，可选集成 **@dnd-kit** 实现自由拖拽布局（拖拽占位边框 `--border-subtle` 虚线，卡片 hover 阴影 `shadow-sm`）。Widget 容器使用 shadcn/ui `Card`，背景 `--bg-secondary`，标题 `--text-primary`，副标题 `--text-muted`。

**统计卡片 Widget** 自研：大号数字 `--text-primary`、趋势箭头使用语义色（上升 `--success`、下降 `--error`、持平 `--text-muted`）、辅助标签 `--text-muted`。不使用彩色背景。

**图表 Widget** 使用 **recharts** 或 **tremor**：柱状图柱体颜色固定 `--text-primary` 或按数据语义使用 `--info`/`--warning`/`--error`/`--success`；饼图切片从固定中性+语义 palette 取色，禁止彩虹色；折线图线条 `--text-primary`，面积填充 `--text-primary` 10% 透明度，网格线 `--border-subtle`；工具提示背景 `--bg-secondary`，边框 `--border-subtle`。所有图表坐标轴文字 `--text-muted`。

**列表 Widget** 使用 **TanStack Table** 或自研高密度列表，行高 40px，hover 背景 `--bg-tertiary`，关联对象可点击跳转。用于展示 Top N 风险任务、超载人员等。

**甘特摘要 Widget** 复用 Schedule 页面自研时间轴组件，展示重点项目时间线，任务条 `--text-primary` 80% 透明度，今天线 `--info`，风险标记 `--error`。

导出功能：图片导出使用 **html2canvas** 捕获 Dashboard 区域，背景需提前设置为 `--bg-primary`；PDF 导出使用 **jspdf**；Excel 导出使用 **xlsx**（或后端直接生成）。导出按钮使用 shadcn/ui `Button` 的 `outline` 变体。

加载态统一使用 shadcn/ui `Skeleton`，颜色映射到 `--bg-tertiary`（#F5F4F2），避免闪烁彩色骨架。Dashboard 配置建议保存为 JSON 并支持分享链接；预置报表可由后端定时生成缓存，提升大数据量下的打开速度。
