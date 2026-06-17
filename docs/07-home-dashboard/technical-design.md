# 首页与看板技术设计

## 1. 后端模块

Rust 模块建议：

```text
dashboard
todo_aggregate
role_entry
recent_activity
```

模块职责：

- 按角色返回首页配置。
- 聚合待办、任务、风险、甘特摘要和最近动态。
- 支持 SA 后台首页数据。
- 支持多角色用户切换角色视角。

## 2. 数据来源

首页不保存业务事实，只聚合各模块数据：

- 待办：通知待办模块。
- 我的任务：任务模块。
- 风险提醒：风险冲突模块。
- 甘特摘要：甘特模块。
- 部门负载：负载模块。
- 配置异常：配置中心。
- 待审核注册：邀请注册模块。
- 系统运行状态：健康检查模块。

## 3. API

```text
GET /api/dashboard
GET /api/dashboard/widgets
GET /api/dashboard/role-entry
POST /api/dashboard/role-view
GET /api/dashboard/recent-activities
```

返回结构：

- `role`。
- `available_roles`。
- `layout`。
- `widgets`。
- `quick_actions`。
- `permissions`。

## 4. 角色入口

角色入口配置来自配置中心：

- 默认首页。
- 默认数据范围。
- 默认时间范围。
- 组件顺序。
- 快捷入口。
- 待办类型。

SA 默认进入 SA 后台首页。待审核用户只能进入资料完善和审核状态。

## 5. 缓存

Redis 缓存：

- 首页组件结果。
- 最近动态。
- 角色入口配置。
- 甘特摘要。

缓存 key 包含：

- 用户 ID。
- 当前角色视角。
- 权限版本。
- 时间范围。

失效事件：

- 任务变更。
- 审批变更。
- 冲突变更。
- 注册审核变更。
- 配置发布。

## 6. 前端实现

- 首页使用可配置组件栅格。
- 组件按角色懒加载。
- 组件失败时只展示局部错误，不阻塞整页。
- 快捷入口从后端返回，前端不硬编码。
- 多角色用户在顶部提供角色视角切换。

