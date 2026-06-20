# 前端页面重构设计原则（第二版）

> 本版不再受原有页面结构束缚，直接参考国际一流工作管理产品的信息架构与交互范式，重新设计 NexusFlow 的前端体验。后端 API、数据模型、权限规则、状态流、审批逻辑全部保持不变。

## 1. 参考的优秀系统

本次重构重点参考以下成熟产品的核心交互理念：

| 系统 | 最值得借鉴的交互 |
|---|---|
| **Linear** | 键盘优先、Cmd+K 命令面板、Issue 右侧面板、Inbox 批量处理、Today 首页、项目/周期视图、极简高密度界面 |
| **Wrike** | 空间/文件夹层级、请求表单、工作负载视图、审批工作流、自定义请求类型、跨项目资源视图 |
| **Notion** | 块编辑器、数据库视图（Table/Board/Calendar/Timeline/Gallery）、页面即对象、双向链接 |
| **Figma** | 右侧属性面板、图层树、多人协作光标、组件化思维 |
| **Slack** | 频道式导航、通知中心、快捷操作、Thread 线程 |
| **Monday.com** | Board 视图、自动化规则、Dashboard Widget、Workload Widget |
| **Asana** | My Tasks、Inbox、Timeline、Portfolio、任务详情面板 |

## 2. 核心设计转向

### 2.1 从“模块菜单”转向“工作上下文导航”

不再把功能平铺成“任务、项目、人员、甘特图、冲突中心、资料库”等并列入口，而是围绕用户的工作上下文组织：

- **Home（今日）**：我现在需要关注什么。
- **Inbox（收件箱）**：所有需要我响应的事项。
- **My Work（我的工作）**：我负责或参与的所有工作。
- **Projects（项目）**：我参与的项目空间。
- **Team（团队）**：人员、技能、负载、日程。
- **Schedule（排程）**：全局甘特图、日历、负载热力图。
- **Files（资料）**：所有文件与交付物。
- **Reports（报表）**：项目、人员、风险、资料的数据洞察。

### 2.2 从“跳转详情页”转向“上下文面板”

参考 Linear 的 Issue 右侧面板和 Figma 的右侧属性面板：

- 点击任务/项目/人员后，从右侧滑出上下文面板。
- 列表与详情同屏，不丢失当前上下文。
- 面板支持固定、多开、拖拽调整宽度。

### 2.3 从“表单堆砌”转向“内联编辑 + 块编辑”

参考 Notion 和 Linear：

- 任务描述、项目概述使用块编辑器，支持段落、标题、列表、待办、代码块、附件。
- 属性字段（负责人、时间、优先级）默认只读，点击后内联编辑。
- 减少弹窗和完整表单页，优先在当前上下文完成编辑。

### 2.4 从“鼠标优先”转向“键盘优先”

参考 Linear：

- `Cmd/Ctrl + K`：命令面板。
- `Cmd/Ctrl + N`：新建。
- `Cmd/Ctrl + /`：查看快捷键。
- `J/K`：列表上下移动。
- `Enter`：打开选中项。
- `Esc`：关闭面板。
- `E`：编辑标题。
- `C`：添加评论。
- `M`：修改负责人。

### 2.5 从“单一视图”转向“数据库式多视图”

参考 Notion 数据库和 Monday.com Board：

- 任何对象集合都支持：Table / List / Board / Timeline / Calendar / Gallery / Workload。
- 视图可保存、可共享、可按角色默认。
- 筛选、排序、分组、隐藏字段均可配置。

## 3. 全局布局骨架

```
┌──────────────────────────────────────────────────────────────────────┐
│  Top Bar：Logo │ Home │ Inbox │ Search (Cmd+K) │ + New │ 🔔 │ 👤   │
├──────────┬───────────────────────────────────────────────────────────┤
│          │  Breadcrumb / 视图标题 / 视图切换 / 筛选 / 分组 / 操作     │
│ Sidebar  ├───────────────────────────────────────────────────────────┤
│          │                                                           │
│          │  Main View                                                │
│          │  （List / Table / Board / Timeline / Calendar / Workload）│
│          │                                                           │
│          ├───────────────────────────────────────────────────────────┤
│          │  Context Panel（可收起/可固定/可拖拽）                    │
└──────────┴───────────────────────────────────────────────────────────┘
```

### 3.1 上下文面板通用结构

所有右侧上下文面板（任务、项目、人员、文件、冲突）统一采用以下 ASCII 结构，具体页面只替换 Header、Meta、Tabs、Action Bar 的内容：

```text
+-------------------------------------------------------------------+
| Main Page                                           Context Panel  |
|                                                                   |
| +-------------------------+  +----------------------------------+ |
| | Toolbar / View Controls |  | Header                           | |
| +-------------------------+  | - Close / Pin / More             | |
| |                         |  | - Primary action                 | |
| | List / Table / Board    |  +----------------------------------+ |
| |                         |  | Title / Object Name              | |
| | selected row highlighted|  | Status badges / key labels       | |
| |                         |  +----------------------------------+ |
| |                         |  | Meta Grid                        | |
| |                         |  | owner | dates | project | risk   | |
| |                         |  +----------------------------------+ |
| |                         |  | Tabs                             | |
| |                         |  | Overview | Work | Files | Log    | |
| |                         |  +----------------------------------+ |
| |                         |  | Scrollable Content               | |
| |                         |  | - section blocks                 | |
| |                         |  | - inline edits                   | |
| |                         |  | - related objects                | |
| |                         |  +----------------------------------+ |
| |                         |  | Sticky Action Bar                | |
| |                         |  | secondary actions | primary CTA  | |
| +-------------------------+  +----------------------------------+ |
+-------------------------------------------------------------------+
```

通用规则：

- Header 固定在面板顶部，Action Bar 固定在面板底部，中间内容独立滚动。
- 面板打开时主列表保留选中态、滚动位置和筛选条件。
- Pin 后点击其他对象只替换面板内容，不收起面板。
- 移动端将 Context Panel 退化为全屏抽屉，Header 和 Action Bar 仍固定。

## 4. 不变的设计系统

虽然信息架构和交互范式改变，但视觉风格保持 NexusFlow 现有设计系统：

- 单色为骨、层级为肉、几何为形。
- 背景层级：`bg-primary #FAF9F7`、`bg-secondary #FFFFFF`、`bg-tertiary #F5F4F2`。
- 文字层级：`text-primary #1A1A1A`、`text-secondary #3A3A3A`、`text-tertiary #5A5A5A`、`text-muted #7A7A7A`。
- 语义色仅用于状态：`success #22C55E`、`warning #F59E0B`、`error #EF4444`、`info #3B82F6`。
- 发丝边框：`border-subtle rgba(0,0,0,0.05)`。
- 字体：Inter + 中文回退。
- 列表行高 48–56px，信息密度优先。
- 过渡动画 150–300ms，无弹簧/回弹。

## 5. 细节扩展原则

为了让页面设计能直接指导实现，后续每个页面都应补齐以下维度，而不是只停留在布局草图：

- **主路径**：明确用户从进入页面到完成关键动作的最短路径，例如“发现待办 → 打开详情 → 处理 → 返回列表”。
- **次路径**：说明搜索、筛选、批量处理、跳转其他对象、从其他页面反向进入时的行为。
- **状态覆盖**：每个页面至少描述加载态、空态、无权限态、接口失败态、部分数据失败态。
- **权限差异**：同一页面在员工、负责人、部门主任、中心领导、SA 下展示哪些入口，隐藏哪些操作。
- **数据联动**：页面内动作会影响哪些对象和哪些入口，例如任务处理后同步更新 Inbox、Home、Schedule、Reports。
- **可撤销与留痕**：高风险操作需要二次确认、原因填写、审计日志；普通编辑需要 optimistic update 和失败回滚。
- **密度控制**：默认视图以高密度工作效率为主，图表、卡片只用于总览和判断，不用来替代可操作列表。
- **键盘可达**：列表型页面必须支持焦点态、上下移动、打开详情、关闭面板；表单型页面必须支持 Enter/Esc 与错误定位。
- **移动端退化**：桌面双栏/右侧面板在移动端退化为全屏抽屉或二级页面，不能简单横向压缩。

所有页面文档在扩展时应优先写“用户能做什么、系统如何响应、失败时如何恢复”，再写组件库和视觉样式。

## 6. 建议组件总览

| 场景 | 推荐组件/库 |
|---|---|
| 基础 UI | shadcn/ui（基于 Radix UI + Tailwind） |
| 命令面板 | cmdk |
| 表格 | TanStack Table + shadcn Table |
| 虚拟滚动 | TanStack Virtual |
| 拖拽 | @dnd-kit |
| 块编辑器 | BlockNote / Editor.js / 自研 Slate |
| 日期处理 | date-fns / luxon |
| 甘特图 | 自研 SVG/Canvas + TanStack Virtual |
| 日历 | react-big-calendar（完全自定义样式） |
| 图表 | recharts / tremor |
| 流程图 | @xyflow/react |
| 抽屉 | vaul / shadcn Sheet |
| 快捷键 | react-hotkeys-hook |
| Toast | Sonner |

## 7. 页面清单（重构后）

| 页面 | 核心参考 | 说明 |
|---|---|---|
| Global Shell | Linear + Slack | 全局导航、命令面板、搜索、通知 |
| Home | Linear Today + Monday Dashboard | 角色化今日工作台 |
| Inbox | Linear Inbox + Slack Activity | 待办与通知收件箱 |
| My Work | Linear My Issues + Asana My Tasks | 个人所有工作 |
| Projects | Linear Projects + Wrike Spaces | 项目空间 |
| Project Detail | Linear Project View | 项目详情上下文面板 |
| Task Detail | Linear Issue Detail + Figma Right Panel | 任务详情上下文面板 |
| Team | Float + Resource Guru + Wrike Workload | 团队与资源 |
| Schedule | Instagantt + Wrike Gantt + Linear Timeline | 排程中心 |
| Conflicts | Linear Triage + Wrike Risk | 冲突与风险处理 |
| Files | Notion Files + Wrike Files | 资料库 |
| Reports | Monday Dashboard + Wrike Reports | 报表中心 |
| Tools | Notion Integrations + Wrike Apps | 工具台 |
| Settings | Linear Settings + Notion Settings | 配置中心 |
| Admin | Linear Admin + Wrike Account Settings | SA 后台 |
