# 全局框架（Global Shell）

> 参考 Linear 的极简顶部导航 + Slack 的频道式侧边栏 + Notion 的页面树，构建一个键盘优先、上下文清晰的全局框架。

## 1. 页面目标

提供统一的导航、搜索、命令、通知、新建入口。无论用户在哪个页面，都能在 1 秒内跳转到任意工作上下文或创建对象。

## 2. 顶部栏（Top Bar）

固定高度 48px（比旧版更紧凑），背景 `--bg-secondary`，底部 1px `--border-subtle`。

### 2.1 左侧

- **Logo**：点击回到 Home。
- **工作区切换器**：当前中心/租户名称，hover 显示下拉。

### 2.2 中部

- **全局搜索框 / 命令面板入口**：
  - 占位文案：`Cmd + K 搜索或跳转...`
  - 点击或按 `Cmd/Ctrl + K` 展开命令面板。
  - 输入 `/` 显示可用命令，输入关键词搜索对象。

### 2.3 右侧

- **+ New 按钮**：深色填充，点击下拉：
  - New Task（任务）
  - New Project（项目）
  - New Leave / Trip（休假/出差）
  - Upload File（上传资料）
  - Invite People（邀请人员，管理员）
- **通知铃铛**：未读待办数量徽章，点击展开 Inbox 抽屉。
- **用户头像**：下拉菜单：Profile、Preferences、Keyboard Shortcuts、Logout。

## 3. 侧边栏（Sidebar）

固定宽度 220px（更窄更聚焦），背景 `--bg-tertiary`，可折叠为 48px 图标栏。

### 3.1 顶部固定区

- **Home**：今日工作台。
- **Inbox**：待办与通知，显示未读数量。
- **My Work**：我的工作。

### 3.2 工作区

- **Projects**：项目列表，支持下拉展开最近项目。
- **Team**：团队与人员。
- **Schedule**：排程中心（甘特/日历/负载）。
- **Files**：资料库。
- **Reports**：报表中心。

### 3.3 个人与系统

- **Tools**：工具台。
- **Settings**：配置中心（管理员）。
- **Admin**：SA 后台（超级管理员）。

### 3.4 底部

- **折叠按钮**：收起为图标栏。
- **帮助入口**：快捷键、文档、反馈。

## 4. 命令面板（Command Palette）

> 参考 Linear 的 Cmd+K 和 Notion 的 / 命令。

### 4.0 面板结构图

```text
+--------------------------------------------------------------+
| Command Palette                                      Esc close |
+--------------------------------------------------------------+
| Search input                                                  |
| [ Cmd+K 搜索或跳转...                                  / ]     |
+--------------------------------------------------------------+
| Recent                                                       |
| > Task: 完成需求评审              Project A       updated 2m |
|   Project: 中心重点项目           Owner Chen      active     |
+--------------------------------------------------------------+
| Navigate                                                     |
|   Home                 Inbox                 My Work          |
|   Projects             Team                  Schedule         |
+--------------------------------------------------------------+
| Actions                                                      |
|   New Task             Upload File           Invite People    |
+--------------------------------------------------------------+
| Footer                                                       |
| J/K move    Enter open    Cmd+Enter new tab    Esc close      |
+--------------------------------------------------------------+
```

输入关键词后的结果结构：

```text
+--------------------------------------------------------------+
| Search input                                                  |
| [ risk review                                          clear ] |
+--------------------------------------------------------------+
| Tasks                                                        |
| > 风险复核任务                 High risk       due today      |
|   评审材料补充                 In progress     Project B      |
+--------------------------------------------------------------+
| Projects                                                     |
|   风险治理专项                 68%             3 open risks   |
+--------------------------------------------------------------+
| People                                                       |
|   Wang Lin                      Dept A          workload 72%   |
+--------------------------------------------------------------+
| Empty / Error slot                                           |
| - no result: Create task "risk review"                       |
| - search error: local navigation commands remain available   |
+--------------------------------------------------------------+
```

### 4.1 触发

- `Cmd/Ctrl + K` 全局触发。
- 点击顶部搜索框触发。

### 4.2 默认视图

未输入时展示：

- **Recent**：最近访问的对象（任务/项目/人员/文件）。
- **Navigate**：快捷导航到 Home / Inbox / My Work / Projects / Team / Schedule。
- **Actions**：新建、上传、查看报表。

### 4.3 搜索结果

输入后即时分组展示：

- Tasks（任务）
- Projects（项目）
- People（人员）
- Files（资料）

每条结果展示：类型图标、标题、状态、所属项目/组织。

### 4.4 命令语法

| 命令 | 效果 |
|---|---|
| `/new task` | 新建任务 |
| `/new project` | 新建项目 |
| `/go inbox` | 打开收件箱 |
| `/go schedule` | 打开排程中心 |
| `/go conflicts` | 打开冲突中心 |
| `/open {对象}` | 打开指定对象 |

## 5. 快捷键体系

> 参考 Linear 的键盘优先设计。

| 快捷键 | 作用 |
|---|---|
| `Cmd/Ctrl + K` | 打开命令面板 |
| `Cmd/Ctrl + N` | 新建任务 |
| `Cmd/Ctrl + /` | 查看快捷键 |
| `J / K` | 列表上下移动 |
| `Enter` | 打开选中项 |
| `Esc` | 关闭面板/弹窗 |
| `E` | 编辑选中对象标题 |
| `C` | 添加评论 |
| `M` | 修改负责人 |
| `G + 字母` | Go to：G 后按 H/I/P/T/S/F/R 跳转 |

## 6. 响应式规则

- 桌面端：侧边栏常驻，命令面板居中弹窗。
- 平板端：侧边栏折叠，命令面板全屏。
- 移动端：底部 Tab 导航（Home / Inbox / My Work / Menu），命令面板全屏。

## 7. 交互细节

- 首次进入系统时，顶部栏先展示骨架：工作区名称、未读数、用户头像并行加载，任一接口失败不阻塞主页面渲染。
- 全局搜索框获得焦点后不直接改变路由，只打开命令面板；用户按 Esc 或点击遮罩后应回到原页面和原焦点。
- 命令面板结果按“最近访问、精确匹配、模糊匹配、动作命令”排序，避免常用对象被全局搜索结果淹没。
- `/new task`、`/go inbox` 这类命令执行后必须关闭命令面板，并把焦点移交给新页面或新抽屉的第一个可操作元素。
- 侧边栏折叠状态属于个人偏好，跨设备可同步时以服务端偏好为准，本地只作为首屏兜底。
- Projects 展开最近项目时最多展示 5 个，超出后给“查看全部项目”，避免侧边栏变成第二个项目列表。
- 通知铃铛点击默认打开 Inbox 抽屉的“待办”Tab；如果只有通知没有待办，则自动定位到“通知”Tab。
- 用户头像菜单中的 Logout 属于危险退出动作，但不需要二次确认；执行失败时停留在当前页面并提示。

## 8. 状态与权限

- 普通用户不展示 Admin，非管理员不展示 Settings 中的全局配置入口，但可以进入个人偏好。
- SA 登录后顶部栏仍保留“返回业务前台”，但 Admin Console 内不展示普通业务侧边栏，避免管理动作和业务动作混在一起。
- 搜索无结果时展示可执行动作，例如“新建任务：{关键词}”或“清除筛选”，而不是只显示空白。
- 搜索服务失败时保留本地最近访问和导航命令，提示“全局搜索暂不可用”，保证用户仍可跳转核心页面。
- 未读数获取失败时隐藏徽章而不是显示 0，避免误导用户以为没有待办。
- 移动端底部 Tab 只放最高频入口，Settings、Reports、Tools 放入 Menu，避免底栏拥挤。

## 建议组件

全局框架是 NexusFlow 的“神经中枢”，既要承载高频导航与命令入口，又要保持极低的视觉噪音。建议以 **shadcn/ui** 作为基础控件层，通过自定义 CSS 变量将组件默认主题映射到本项目的设计系统：`--background` 使用 `--bg-secondary`（#FFFFFF），`--muted` 使用 `--bg-tertiary`（#F5F4F2），`--border` 使用 `--border-subtle`（rgba(0,0,0,0.05)），文字色阶从 `--foreground` 到 `--muted-foreground` 依次对应 `--text-primary`（#1A1A1A）到 `--text-muted`（#7A7A7A）。这样所有 shadcn 组件在引入瞬间即可与背景层级、发丝边框、文字层级保持一致，避免引入额外颜色。

顶部栏的 **Logo、工作区切换器、+ New 按钮、通知铃铛、用户头像** 可直接使用 shadcn/ui 的 `Button`、`DropdownMenu`、`Avatar`、`Badge`、`Tooltip`、`Separator`、`Skeleton`。顶部栏固定高度 48px，背景 `--bg-secondary`，底部 1px `--border-subtle`。其中 + New 按钮使用 shadcn 的 `default` 变体并覆盖背景色为 `--text-primary`、文字色为 `--bg-secondary`，保持深色主操作；通知徽章仅使用语义色 `--info`（#3B82F6）表示未读数量，不引入新色彩。工作区切换器使用 `DropdownMenu`，下拉菜单背景 `--bg-secondary`，选项 hover `--bg-tertiary`，分割线 `--border-subtle`。用户头像下拉菜单包含 Profile、Preferences、Keyboard Shortcuts、Logout，同样使用 `DropdownMenu`，危险操作 Logout 使用 `--error` 文字色。

命令面板是全局框架的核心交互，直接决定用户能否在 1 秒内跳转到任意上下文。推荐使用 **cmdk** 实现命令解析、分组、键盘导航与最近访问列表，配合 **react-hotkeys-hook** 监听全局 `Cmd/Ctrl + K`、`Cmd/Ctrl + N`、`Cmd/Ctrl + /` 等快捷键。命令面板容器在桌面端使用 shadcn/ui `Dialog`（居中弹窗，最大宽度 640px），在平板/移动端使用 **vaul** 或 shadcn/ui `Sheet`（全屏抽屉）。未输入时展示 Recent / Navigate / Actions 分组，输入后即时分组展示 Tasks / Projects / People / Files。每条结果展示类型图标（Lucide 线图标，颜色 `--text-muted`）、标题 `--text-primary`、状态 badge、所属对象 `--text-muted`。搜索结果如果超过 50 条，使用 **TanStack Virtual** 做虚拟滚动，保证 300ms 内完成首屏渲染。命令语法如 `/new task`、`/go inbox` 可通过 cmdk 的自定义过滤实现。搜索索引建议在前端建立轻量 Fuse.js 索引或调用后端搜索 API，输入延迟 150ms 防抖。

侧边栏建议自研而非使用现成库，因为需要精确控制 220px 展开态与 48px 折叠态的切换动画。实现时使用 CSS Grid + `transition-all duration-200`，背景色固定为 `--bg-tertiary`（#F5F4F2），hover 态仅通过 `bg-black/5` 微调，不新增颜色。侧边栏分四区：顶部固定区（Home / Inbox / My Work）、工作区（Projects / Team / Schedule / Files / Reports）、个人与系统（Tools / Settings / Admin）、底部（折叠按钮 / 帮助入口）。每项高度 40px，图标 20px，文字 `text-sm text-primary`，选中态左侧 3px `--text-primary` 竖线、背景 `--bg-tertiary`。Projects 支持下拉展开最近项目，使用自研动画或 shadcn/ui `Collapsible`。折叠按钮与帮助入口使用 shadcn/ui `Button` 的 `ghost` 变体。侧边栏折叠状态持久化保存到用户偏好。

响应式规则中，桌面端侧边栏常驻，命令面板居中弹窗；平板端侧边栏折叠为 48px 图标栏，命令面板全屏；移动端使用底部 Tab 导航（Home / Inbox / My Work / Menu），可复用 shadcn/ui `Tabs` 并自定义样式：固定底部 56px，背景 `--bg-secondary`，顶部 1px `--border-subtle`，选中态使用文字色 `--text-primary` 加底部 2px 指示条，不使用主色填充，保持整体色调克制。移动端 Menu 打开后展示侧边栏菜单项的图标+文字列表，背景 `--bg-secondary`。

快捷键体系除 `Cmd/Ctrl + K`、`Cmd/Ctrl + N` 外，列表内的 `J/K`、`Enter`、`Esc`、`E/C/M` 以及 `G + 字母` 跳转全部通过 **react-hotkeys-hook** 注册。为避免与输入框冲突，需判断 `event.target` 是否为可编辑元素。快捷键提示弹窗使用 shadcn/ui `Dialog` + `Table` 展示，表格边框 `--border-subtle`，表头 `--bg-tertiary`。加载态统一使用 shadcn/ui `Skeleton`，骨架颜色映射到 `--bg-tertiary`，避免彩色闪烁。全局框架的初始化数据（用户信息、未读数、最近项目）应在应用启动时并行预取，避免页面切换时的布局偏移。
