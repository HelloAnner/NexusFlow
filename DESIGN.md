# NexusFlow 设计系统

NexusFlow 是中心内部工作管理系统，设计继承 Northline 的「单色为骨、层级为肉、几何为形」原则，并针对工作管理场景（任务、项目、人员、负载、审批、资料）做适度调整。

> 设计稿源文件为 `nexusflow.pen`，本文是设计 token 与用法说明。新增 token 请先更新 `.pen` 变量再同步本文。
>
> 当前 `.pen` 文件中的顶层画板：登录页、首页看板、任务列表、任务详情、新建任务、项目列表、人员列表、甘特图、冲突中心、配置中心、SA 后台。请在 Pencil 桌面端中保存文件以持久化到磁盘。

---

## 1. 设计哲学

1. **单色为主，层级分区**：通过背景色层级（bg-primary / secondary / tertiary / elevated）划分导航、面板、卡片、行，不使用粗描边或装饰阴影。
2. **反相表达主操作**：Primary 按钮使用深色填充（近黑）+ 浅色文字，不使用品牌色或渐变填充按钮。
3. **语义色仅用于状态**：绿/黄/红/蓝只出现在任务状态、负载、风险、冲突、徽章中，不作为 UI 主色。
4. **信息密度优先**：任务列表、人员列表、甘特图、审批列表使用行式密排，减少不必要的卡片包裹。
5. **边框仅为辅助**：使用半透明发丝边框（`border-subtle` / `border-muted`），不使用 `#ddd` 类实线。
6. **动效短而克制**：150–300ms 过渡，不使用弹簧/回弹或超过 400ms 的动画。

---

## 2. 颜色系统

### 2.1 背景层级

| Token | 亮色值 | 用途 |
|---|---|---|
| `--bg-primary` | `#FAF9F7` | 应用画布、登录页背景 |
| `--bg-secondary` | `#FFFFFF` | 卡片、面板、表单容器、表格 |
| `--bg-tertiary` | `#F5F4F2` | 侧栏、表头、输入框基底、搜索框 |
| `--bg-elevated` | `#FFFFFF` | 下拉、tooltip、悬浮容器 |

### 2.2 文字层级

| Token | 值 | 用途 |
|---|---|---|
| `--text-primary` | `#1A1A1A` | 标题、主要内容、数字 |
| `--text-secondary` | `#3A3A3A` | 次要正文、表格 cell |
| `--text-tertiary` | `#5A5A5A` | 辅助说明 |
| `--text-muted` | `#7A7A7A` | 标签、图标、panel title、placeholder |
| `--text-placeholder` | `#9A9A9A` | 输入占位 |

### 2.3 边框

| Token | 透明度 | 用途 |
|---|---|---|
| `--border-subtle` | `rgba(0,0,0,0.05)` | 默认边框（卡片、输入、表格、分隔线） |
| `--border-muted` | `rgba(0,0,0,0.03)` | 极弱分隔（列表行间、嵌套分区） |
| `--border-faint` | `rgba(0,0,0,0.02)` | 仅用于嵌套容器内部分区 |

### 2.4 交互态

| Token | 值 | 用途 |
|---|---|---|
| `--hover-bg` | `rgba(0,0,0,0.04)` | 常规悬停 |
| `--hover-bg-strong` | `rgba(0,0,0,0.06)` | 导航激活、强化悬停 |
| `--selected-bg` | `rgba(0,0,0,0.05)` | 选中态 |
| `--active-bg` | `rgba(0,0,0,0.08)` | 按下态 |

### 2.5 语义色（仅用于状态）

| Token | 值 | 用途 |
|---|---|---|
| `--color-success` | `#22C55E` | 已完成、进度正常、在岗 |
| `--color-success-bg` | `rgba(34,197,94,0.10)` | 成功状态 badge 背景 |
| `--color-warning` | `#F59E0B` | 待确认、中风险、负载接近饱和 |
| `--color-warning-bg` | `rgba(245,158,11,0.10)` | 警告状态 badge 背景 |
| `--color-error` | `#EF4444` | 有风险、严重冲突、超载、延期 |
| `--color-error-bg` | `rgba(239,68,68,0.10)` | 错误状态 badge 背景 |
| `--color-info` | `#3B82F6` | 提示、链接、审批类状态 |
| `--color-info-bg` | `rgba(59,130,246,0.10)` | 信息状态 badge 背景 |

### 2.6 主操作反相

| Token | 值 | 用途 |
|---|---|---|
| `--primary-fill` | `#1A1A1A` | Primary 按钮填充、激活 tab 填充 |
| `--primary-text` | `#FAFAFA` | Primary 按钮文字、激活 tab 文字 |

---

## 3. 间距与圆角

### 3.1 间距

基于 4px 网格：

```
--spacing-1: 4px
--spacing-2: 6px
--spacing-3: 8px
--spacing-4: 10px
--spacing-5: 12px
--spacing-6: 14px
--spacing-7: 16px
--spacing-8: 20px
--spacing-9: 24px
--spacing-10: 32px
```

### 3.2 圆角

```
--radius-sm: 6px   /* badge、小标签 */
--radius-md: 8px   /* 按钮、输入、tab、行 */
--radius-lg: 10px  /* 卡片、面板 */
--radius-xl: 12px  /* 大面板 */
--radius-2xl: 16px /* 登录/新建表单卡片 */
```

---

## 4. 字体排版

**字体族：** Inter + 系统中文回退

| 场景 | 字号 | 字重 |
|---|---|---|
| 页面标题 | 20px | 600 |
| 卡片/面板标题 | 15px | 600 |
| 表单标题 | 17px | 600 |
| 正文、行条目 | 13–14px | 400–500 |
| Panel Title（小写大写标签） | 12px | 600 + letter-spacing 0.05em |
| 次级标签、元数据 | 11–12px | 400–500 |
| 徽章文字 | 11px | 500 |
| Stat 大数字 | 26px | 700 |

---

## 5. 组件规范

### 5.1 按钮

```
Primary   bg: --primary-fill    color: --primary-text
Secondary bg: transparent       color: --text-muted    border: 1px solid --border-subtle
Ghost     bg: transparent       color: --text-muted
Danger    bg: transparent       color: --color-error   border: 1px solid --color-error
```

尺寸：高度 34–40px，水平 padding 14–20px，圆角 8px。

### 5.2 输入框

```
bg: --bg-secondary
border: 1px solid --border-subtle
border-radius: 8px
font-size: 13–14px
padding: 10px 14px
focus: border-color → --text-muted
```

Label 放在输入框上方，12px muted。

### 5.3 列表与表格

**行式列表/表格**：
- 行高 48–56px
- 行分隔使用 1px `--border-subtle`
- 表头使用 `--bg-tertiary`
- 单元格内容为 text，不直接放在 row 下

**卡片式容器**：
- padding 16–20px
- border 1px `--border-subtle`
- border-radius 10px
- background `--bg-secondary`

### 5.4 Badge / 状态标签

```
padding: 2px 8–10px
border-radius: 4–6px
font-size: 11px
font-weight: 500
```

默认 badge 背景 `--hover-bg`，文字 `--text-muted`；状态 badge 使用语义色 10% 透明背景 + 语义色文字。

### 5.5 侧栏导航

- 宽度 240px（SA 后台 260px）
- 背景 `--bg-tertiary`
- 导航项 padding 8–10px，圆角 8px
- 激活态：背景 `--hover-bg` + 文字 `--text-primary` + 字重 500
- 默认态：背景透明 + 文字 `--text-muted`

### 5.6 顶部 Tab

```
active: bg --primary-fill  color --primary-text  weight 600
idle:   bg transparent     color --text-muted
padding: 6px 14px
border-radius: 6px
```

### 5.7 Stat 卡片

```
容器：padding 16–20px、border-radius 10px、bg-secondary + border-subtle
结构：小 muted 标签 → 26px/700 数字 → 次级 muted 说明
```

### 5.8 面板（Panel）

```
容器：bg-secondary + border-subtle + radius-lg + padding 16–20
title: 12px 600 muted uppercase letter-spacing 0.05em
```

---

## 6. 页面结构

### 6.1 通用布局

所有业务页面采用：

```
┌─────────────────────────────────────┐
│ Sidebar (240px) │ Header            │
│                 ├───────────────────┤
│                 │ Page Content      │
│                 │                   │
└─────────────────────────────────────┘
```

- 画布 `--bg-primary`
- 侧栏 `--bg-tertiary`
- 主内容区 padding 24–32px

### 6.2 登录页

- 左右分栏：左侧品牌说明 `--bg-secondary`，右侧表单 `--bg-primary`
- 表单卡片：圆角 16px、边框、最大宽度 400px
- 大留白、低信息密度

### 6.3 首页看板

- 顶部：问候语 + 日期 + 全局搜索 + 新建任务 + 用户头像
- 上部：4 个 Stat 卡片（进行中任务、待处理审批、部门负载、本周到期）
- 中部：左右分栏
  - 左侧：我的任务列表（行式）
  - 右侧：我的待办 + 风险提醒

### 6.4 任务列表

- 筛选栏：状态、类型、优先级、负责人、所属组织、时间范围
- 表格列：任务名称、状态、类型、负责人、起止时间、进度、风险、操作
- 分页器居右

### 6.5 任务详情

- 顶部：面包屑导航 + 编辑/提交成果操作
- 左侧主区：状态标签、任务标题、创建/更新时间、任务描述卡片、子任务清单
- 右侧信息卡：负责人、项目、类型、优先级、起止时间、进度

### 6.6 新建任务

- 顶部步骤条：基本信息 → 资源分配 → 确认
- 居中表单卡片，宽度 720px
- 字段：任务标题、任务类型、优先级、负责人、所属项目、开始时间、截止时间、任务描述
- 底部操作：取消 / 创建任务

### 6.7 项目列表

- 顶部统计：全部项目、进行中、有风险、已完成
- 筛选栏：状态、类型、负责组织
- 表格列：项目名称/编号、状态、类型、负责人、起止时间、进度、操作
- 进度使用深色进度条可视化

### 6.8 人员列表

- 顶部统计：全部人员、负载正常、负载超载、负载不足
- 卡片网格：头像、姓名/部门、角色标签、负载状态、当前任务数
- 负载状态使用颜色区分：正常绿 / 警告橙 / 超载红

### 6.9 全局甘特图

- 顶部工具栏
  - 视图维度：项目 / 任务 / 人员 / 部门
  - 时间粒度：月 / 周 / 日
  - 日期范围选择器
  - 「只看风险」快捷筛选
- 左侧树形列：部门分组（▾ 研发部 / 市场部 / 人力资源部 / 行政部）+ 下属项目/任务
- 右侧时间轴：5–8 月表头 + 垂直月分隔线
- 任务条按起止时间水平分布；正常周期使用深色条，风险/冲突任务使用红色条
- 蓝色垂直线标记「今天」
- 底部图例：正常 / 风险/冲突 / 今天

### 6.10 冲突中心

- 顶部筛选标签：全部 / 人员超载 / 时间冲突 / 跨组织 / 权限 / 资源，右侧排序下拉
- 左侧冲突卡片列表：每条冲突包含类型标签、风险等级 badge、标题、描述、涉及对象、发生时间、状态 badge
- 卡片底部操作：处理 / 转交 / 忽略
- 右侧汇总面板：待处理/高风险/已解决统计、按类型分布、部门负载预警
- 风险等级：高（红）、中（橙）、低（绿）；状态：待处理红 / 处理中蓝 / 已解决绿

### 6.11 配置中心

- 顶部搜索框 + 关键统计（流程模板数 / 权限模板数 / 通知规则数）
- 左侧配置菜单：流程模板、权限模板、通知规则、系统集成、系统参数、安全设置
- 右侧设置卡片：按模块分组，每行展示配置项名称、说明、当前值
- 当前值使用标签或开关样式展示

### 6.12 SA 后台

- 顶部统计：租户、用户、在线、健康度
- 分块卡片：租户管理、用户管理、系统监控
- 每块以行式列表展示关键指标

---

## 7. 交互与动效

```
--transition-fast:   150ms
--transition-normal: 200ms
--transition-slow:   300ms
```

- 按钮悬停 150ms
- 状态切换、tab 切换 200ms
- 抽屉/弹窗 300ms
- 不使用 spring、bounce、回弹

---

## 8. Do / Don't

### ✅ Do

- 用背景层级差做分区，不用粗描边
- 用反相（深色填充 + 浅色文字）表达 Primary 按钮和激活态
- 用 uppercase + letter-spacing 的小号 muted 标签作为 Panel Title
- 用行式列表展示高密度信息（任务、人员、审批、冲突）
- 用语义色表达状态，但背景使用 10% 透明语义色
- 保持同一业务对象在不同页面字段一致
- 列表页保留筛选条件和视图偏好

### ❌ Don't

- 不用彩色或渐变填充按钮
- 不用 1px 以上或高对比实线边框
- 不用装饰性阴影给卡片/按钮
- 不用 emoji 表达状态或语义
- 不用大号粗体中文充当小节标题
- 不用超过 400ms 的动效
- 不在未授权场景展示隐藏项目标题、摘要、时间

---

## 9. 参考

- [Northline 设计系统](/Users/anner/northline/DESIGN.md)
- Linear — 单色激活、密度、uppercase 标签
- Vercel — 发丝边框、clean stat
