# NexusFlow 前端实现指南

## 目标
为 `nexusflow.pen` 中的每个业务页面创建 1:1 视觉还原的 React 页面组件。

## 项目结构
```
frontend/src/
  components/ui.tsx       # 所有基础 UI 组件
  components/layout.tsx   # Sidebar / TopHeader / MainLayout / AuthLayout
  lib/utils.ts            # cn 工具
  types/index.ts          # 类型定义
  pages/<PageName>.tsx    # 页面组件（你负责创建）
  mocks/<page>.ts         # 页面 Mock 数据（可选）
  App.tsx                 # 路由表（不要改已有首页/登录路由，新增即可）
```

## 可用组件
全部从 `@/components/ui` 导入：
- `Button`：variant = 'primary' | 'secondary' | 'ghost' | 'danger'
- `Input`：label, placeholder, type...
- `Select`：label, options
- `SearchInput`：placeholder, className
- `Badge`：灰色小标签
- `Tag`：variant = 'success' | 'warning' | 'error' | 'info'
- `Avatar` / `AvatarGroup`
- `StatCard`：label, value, sub
- `Panel`：title, children, right
- `ListRow`：left, right
- `ProgressBar`：value (0-100)
- `StatusDot` / `LoadIndicator`
- `NavItem`
- `Tabs`：tabs, value, onChange
- `EmptyState`
- `SectionTitle`
- `TimelineItem`
- `MetricMini`
- `Table / Thead / Tbody / Tr / Th / Td`

布局组件从 `@/components/layout` 导入：
- `MainLayout({ title, subtitle?, children })`：用于业务页面
- `AuthLayout({ children })`：用于登录页

## 设计 token（Tailwind 类）
- 背景：bg-bg-primary（#FAF9F7）画布、bg-bg-secondary 卡片、bg-bg-tertiary 侧栏/输入底
- 文字：text-text-primary / text-secondary / text-tertiary / text-muted / text-placeholder
- 边框：border-border-subtle / border-muted
- 主操作：bg-primary-fill text-primary-text
- 语义色：text-color-success / warning / error / info；背景：bg-color-success-bg / warning-bg / error-bg / info-bg
- 字号：text-xs (11) / text-sm (12) / text-base (13) / text-lg (14) / text-xl (15) / text-2xl (17) / text-3xl (20) / text-stat (26)
- 圆角：rounded-sm / rounded-md / rounded-lg / rounded-xl / rounded-2xl

## 页面实现步骤
1. 查看分配给你的页面摘要文件 `../../page_summary_<Page_Name>.txt`。
2. 若存在对应截图，参考 `../../screenshots/` 中的 PNG。
3. 在 `src/pages/<PageName>.tsx` 创建默认导出的页面组件。
4. 使用 `MainLayout` 包裹业务页面；标题和副标题与 `.pen` 页面一致。
5. 用组件和 Tailwind 类还原布局、文案、颜色、图标。
6. 需要的数据放在 `src/mocks/<page>.ts`，然后在页面导入。
7. 在 `src/App.tsx` 注册你的路由（已有 `/`、`/login`，不要覆盖）。
8. 运行 `bun run dev`（已在后台 5173 端口运行）验证无报错。

## 路由约定
- 首页 Dashboard：`/`
- 登录：`/login`
- 任务列表：`/tasks`
- 任务详情：`/tasks/:id`
- 新建任务：`/tasks/new`
- 项目列表：`/projects`
- 人员列表：`/people`
- 甘特图：`/gantt`
- 冲突中心：`/conflicts`
- 资料库：`/resources`
- 工具台：`/tools`
- 配置中心：`/config`
- SA 后台：`/admin`

## 图标
使用 `lucide-react`。常用映射：
- 首页：LayoutDashboard
- 任务：CheckSquare
- 甘特图：BarChart3
- 项目：Folder
- 人员：Users
- 冲突：AlertCircle
- 资料：FileText
- 工具：Wrench
- 配置：Settings
- 系统管理：Shield
- 搜索：Search；加号：Plus；箭头：ChevronRight / ChevronDown
