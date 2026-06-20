# SA 后台（Admin Console）

> 参考 Linear Admin 和 Wrike Account Settings，为超级管理员提供独立、专业、可审计的系统管理后台。

## 1. 页面目标

为超级管理员提供系统初始化、组织人员全量维护、邀请注册管理、账号安全、审计日志等能力。

## 2. 整体布局

```
┌────────────────────────────────────────────────────────────────┐
│  Admin Console    [ 返回业务前台 ]                              │
├───────────────────────┬────────────────────────────────────────┤
│                       │                                        │
│  SA 后台菜单          │  管理内容区                            │
│                       │                                        │
└───────────────────────┴────────────────────────────────────────┘
```

## 3. 左侧菜单

- Dashboard（首页）
- Organizations（组织管理）
- People（人员管理）
- Accounts（账号管理）
- Invitations（邀请模板与链接）
- Pending Approvals（待审核注册）
- Role Entry Config（角色入口配置）
- Audit Logs（审计日志）
- System Monitor（系统监控）
- Security（安全设置）

## 4. Admin Dashboard

- 系统健康状态卡片。
- 待处理事项：待审核注册、邀请异常、配置告警、权限风险。
- 快速统计：用户总数、在线用户、今日登录。

## 5. 人员全量编辑

- 可维护人员全部字段。
- 修改组织、角色、隐藏项目授权、账号状态必须填写原因并写入审计。

### 5.1 SA 编辑面板 ASCII 图

```text
+----------------------------------------------------------+
| Admin Edit Panel                                  X       |
| People / Wang Lin                                 More    |
+----------------------------------------------------------+
| Identity                                                 |
| Wang Lin | wang@example.com | ID: U-1024                 |
| [active] [Research Dept] [Employee]                       |
+----------------------------------------------------------+
| Editable sections                                        |
| Account status      [active v]                           |
| Organization        [Research Dept v]                    |
| Roles               [Employee] [Project Owner] [+]        |
| Hidden project auth [3 projects] [Manage]                |
+----------------------------------------------------------+
| Impact preview                                           |
| - 12 active tasks may be affected                         |
| - 4 project memberships will change                       |
| - User will lose access to 2 hidden projects              |
+----------------------------------------------------------+
| Required reason                                          |
| [ textarea: why this admin change is needed ]            |
+----------------------------------------------------------+
| Audit preview                                            |
| Operation type: account / permission / organization      |
| Operator: Anner                                          |
| Timestamp: generated on save                             |
+----------------------------------------------------------+
| Sticky actions                                           |
| [Cancel] [Reset changes]                    [Save change] |
+----------------------------------------------------------+
```

## 6. 邀请管理

- 邀请模板：创建/编辑/停用/复制。
- 邀请链接：生成/复制/停用/查看使用记录。
- 完整链接只在生成时展示一次。

## 7. 待审核注册

- 待审核用户列表。
- 操作：通过 / 拒绝 / 要求补充资料。
- 批量通过/拒绝。

## 8. 审计日志

- 类型筛选：登录、操作、审批、配置变更、账号安全。
- 时间范围、操作人筛选。
- 支持导出。

## 9. 与业务前台切换

- 顶部提供“返回业务前台”。
- 业务前台侧边栏保留 Admin 入口。

## 10. SA 操作原则

- Admin Console 不承载普通业务协作，只承载系统级管理和审计能力，避免 SA 在后台误处理业务任务。
- 所有批量操作默认先预览影响范围，再执行；执行结果需要展示成功、失败、跳过的明细。
- 涉及账号、权限、组织、邀请链接的修改必须填写原因并进入审计日志。
- SA 可以代为修复数据，但页面必须明确显示“以超级管理员身份操作”。
- 返回业务前台时保留 Admin 当前路由，下次进入继续回到上次管理位置。

## 11. 重点模块细节

- Organizations：支持组织树、组织状态、负责人、人数统计；停用组织前检查下级组织和人员。
- People：全量人员字段可编辑，但敏感字段需要二次确认；离职/停用后不可被分配新任务。
- Accounts：展示登录方式、最近登录、失败登录次数、锁定状态；解锁和重置密码写入审计。
- Invitations：完整邀请链接只在生成时展示一次，之后仅展示脱敏链接和复制新链接入口。
- Pending Approvals：通过前可选择组织、角色、入口权限；拒绝和补充资料必须填写原因。
- Audit Logs：默认只读不可编辑，支持按对象 ID、操作人、时间范围追踪。
- System Monitor：用于健康判断，不替代专业监控系统；严重告警推送到 SA Inbox。

## 12. 安全与异常

- SA 后台所有接口失败都需要明确保留上下文，不能因为单个表格失败导致整个后台不可用。
- 导出审计日志需要二次确认，并记录导出人、筛选条件和导出时间。
- 邀请链接停用后，旧链接访问应展示失效原因和联系管理员入口。
- 批量导入人员时需要先预校验，显示重复账号、缺失字段、无效组织，再允许提交。
- 权限风险卡片点击后进入具体风险列表，不只展示统计数字。

## 建议组件

SA 后台是面向超级管理员的专业管理界面，需要呈现系统级数据、支持批量操作与审计。建议基础控件统一使用 **shadcn/ui**，并通过 CSS 变量映射到 NexusFlow 色板：页面背景 `--bg-primary`（#FAF9F7），左侧菜单 `--bg-secondary`（#FFFFFF），管理内容区 `--bg-secondary`，选中/悬浮 `--bg-tertiary`（#F5F4F2），边框 `--border-subtle`（rgba(0,0,0,0.05)），文字 `--text-primary`（#1A1A1A）/`--text-muted`（#7A7A7A）。状态 badge 严格使用语义色：`--success`（正常）、`--warning`（警告）、`--error`（异常/风险）、`--info`（进行中）。

左侧 SA 后台菜单自研或使用 shadcn/ui `Sidebar`，包含 Dashboard、Organizations、People、Accounts、Invitations、Pending Approvals、Role Entry Config、Audit Logs、System Monitor、Security。顶部提供“返回业务前台”按钮，使用 shadcn/ui `Button` 的 `ghost` 变体，图标 + 文字。菜单项选中态左侧 3px `--text-primary` 竖线，背景 `--bg-tertiary`。

**Admin Dashboard** 使用自研指标卡片网格：系统健康状态卡片（正常 `--success`、警告 `--warning`、异常 `--error`）、待处理事项（待审核注册、邀请异常、配置告警、权限风险）、快速统计（用户总数、在线用户、今日登录）。卡片使用 shadcn/ui `Card`，背景 `--bg-secondary`，数字 `--text-primary`，标签 `--text-muted`，状态色仅用于小圆点或左侧竖线，不做大面积彩色背景。

**人员、账号、邀请、日志列表**统一使用 **TanStack Table**。表头背景 `--bg-tertiary`，行分割线 `--border-subtle`，hover 行 `--bg-tertiary`。人员全量编辑时，修改组织、角色、隐藏项目授权、账号状态必须填写原因，使用 shadcn/ui `Dialog` 或 `Sheet` 表单，原因字段必填，保存后写入审计日志。危险操作（禁用账号、删除组织）使用 shadcn/ui `AlertDialog` 二次确认。

**组织树组件**建议自研，支持拖拽调整组织层级，拖拽库使用 **@dnd-kit**。树节点高度 36px，选中背景 `--bg-tertiary`，hover 背景 `--bg-tertiary`/50%，展开图标 `--text-muted`。拖拽占位显示 `--border-subtle` 虚线边框。组织节点支持新增、编辑、停用、删除。

**系统监控图表**使用 **recharts** 或 **tremor**：CPU/内存/请求量折线图线条 `--text-primary`，面积填充 `--text-primary` 10% 透明度，告警阈值线 `--error`，网格线 `--border-subtle`；在线用户/今日登录使用统计卡片。监控数据可设置刷新间隔。

**角色入口配置**如果涉及流程图，使用 **@xyflow/react**，节点颜色限制为中性/语义色。审计日志支持按类型筛选（登录、操作、审批、配置变更、账号安全）、时间范围、操作人筛选，以及导出 Excel，使用 **xlsx** 在前端生成或调用后端接口。**日志导出图片**可使用 **html2canvas** 做报表快照。

待审核注册列表操作（通过 / 拒绝 / 要求补充资料）使用 shadcn/ui `Button` 分组，批量通过/拒绝使用 shadcn/ui `Checkbox` 多选 + 顶部悬浮批量操作栏。邀请链接应设置有效期与最大使用次数，生成时记录到审计日志；系统监控数据建议保留 30 天，关键告警实时推送到 SA Inbox。
