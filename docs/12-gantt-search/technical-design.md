# 甘特图与全局搜索技术设计

## 1. 后端模块

Rust 模块建议：

```text
gantt
search
saved_filter
```

模块职责：

- 聚合任务、分工、项目、人员状态和冲突数据。
- 生成甘特图条目。
- 提供对象级全文搜索。
- 管理个人筛选视图。

## 2. 甘特图查询

查询流程：

```text
解析用户权限 -> 解析视图维度 -> 查询任务/分工/项目/人员状态 -> 合并冲突风险 -> 脱敏 -> 返回条目
```

甘特条目字段：

- `id`。
- `type`。
- `title`。
- `start`。
- `end`。
- `progress`。
- `status`。
- `risk_level`。
- `target_url`。
- `readonly`。

## 3. 搜索实现

一期使用 PostgreSQL 全文检索。

建议字段：

- `search_vector`。
- `search_text`。
- `object_type`。
- `object_id`。
- `updated_at`。

可用对象：

- 任务。
- 项目。
- 人员。
- 资料。

权限裁剪在查询阶段完成。

## 4. API

```text
GET  /api/gantt
GET  /api/gantt/summary
GET  /api/search
GET  /api/search/suggest
POST /api/saved-filters
GET  /api/saved-filters
```

## 5. 缓存

Redis 缓存甘特结果：

- 用户 ID。
- 角色视角。
- 权限版本。
- 时间范围。
- 筛选条件。

搜索建议可以短期缓存，正式搜索必须保证权限实时裁剪。

## 6. 事件

消费：

- 任务变更。
- 项目变更。
- 人员变更。
- 资料变更。
- 冲突变更。
- 权限变更。

处理：

- 甘特缓存失效。
- 搜索向量更新。

## 7. 前端实现

- 甘特图使用虚拟滚动。
- 大时间范围按窗口加载。
- 甘特条点击跳转详情。
- 搜索弹窗提供即时建议。
- 搜索结果页按类型筛选。

