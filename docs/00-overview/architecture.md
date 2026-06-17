# 系统架构设计

## 1. 架构目标

系统采用 Rust 后端、TypeScript + Bun 前端。最终交付形态为一个可执行二进制文件，启动后同时提供 API 服务和前端静态资源服务，默认监听端口 `8089`。

架构目标：

- 单进程部署，降低中心内部环境的交付和运维复杂度。
- 后端承担业务规则、权限裁剪、工作流、负载计算、文件元数据和报表统计。
- 前端承担交互、表单编排、甘特图渲染、人员选择器、配置页面和管理工作台。
- 基础组件通过 `.env` 配置连接地址和凭据，不要求系统关心组件部署在哪里。
- 不使用 Docker 作为运行前提，部署时只需要二进制、静态资源内嵌结果、`.env` 和可连接的基础组件。

## 2. 技术栈

### 2.1 后端

- 语言：Rust。
- Web 框架：Axum。
- 异步运行时：Tokio。
- 数据访问：SQLx。
- 关系数据库：PostgreSQL，作为主数据、权限、流程、配置、审计和报表口径存储。
- 缓存与轻量队列：Redis，用于会话、权限缓存、短期计算结果、通知待办分发和轻量异步任务。
- 对象存储：S3 兼容对象存储，默认按 MinIO 协议接入，用于资料附件和导出文件。
- 搜索：PostgreSQL 全文检索作为一期默认方案，后续可通过配置切换到 Meilisearch 或 OpenSearch。
- 任务调度：后端内置 Tokio 定时任务，用于审批超时、截止提醒、资料归档检查和报表预计算。

PostgreSQL、Redis、MinIO 都是外部服务。系统只要求能通过 `.env` 连接，不关心它们部署在本机、内网服务器还是云服务。

### 2.2 前端

- 语言：TypeScript。
- 包管理与构建：Bun。
- UI 框架：React。
- 路由：TanStack Router 或 React Router。
- 请求状态：TanStack Query。
- 表格与复杂列表：TanStack Table。
- 甘特图：自研 SVG/Canvas 视图层，后续可替换专业甘特图库，但业务计算必须留在后端。
- 构建产物：Bun 构建为静态资源，由 Rust 二进制内嵌或随二进制同目录读取。

### 2.3 单二进制运行

推荐构建流程：

```text
Bun 构建前端静态资源 -> Rust 编译后端 -> 前端资源内嵌进 Rust 二进制 -> 输出 nexusflow
```

运行方式：

```bash
./nexusflow
```

默认行为：

- 读取当前目录或指定路径的 `.env`。
- 连接 PostgreSQL、Redis 和对象存储。
- 执行数据库迁移检查。
- 启动 HTTP 服务。
- 默认端口为 `8089`。
- `/api/*` 提供后端 API。
- `/assets/*` 和其他前端路由返回前端静态资源。

## 3. 运行时拓扑

```text
Browser
  |
  | HTTP
  v
NexusFlow single binary :8089
  |-- Frontend static files
  |-- REST API
  |-- Auth and permission engine
  |-- Workflow and approval engine
  |-- Load and conflict engine
  |-- Report and search engine
  |-- Scheduler
  |
  | SQL
  v
PostgreSQL
  |
  | Redis protocol
  v
Redis
  |
  | S3 protocol
  v
S3 compatible object storage
```

## 4. `.env` 配置

`.env` 只描述系统运行需要连接哪些基础组件，以及运行参数。不得把 Docker、容器网络或本机路径作为必需前提。

基础示例：

```env
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=8089
APP_PUBLIC_URL=http://127.0.0.1:8089

DATABASE_URL=postgres://user:password@127.0.0.1:5432/nexusflow
DATABASE_MAX_CONNECTIONS=20

REDIS_URL=redis://127.0.0.1:6379/0
REDIS_KEY_PREFIX=nexusflow:

S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=nexusflow
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

SESSION_SECRET=change-me
JWT_SECRET=change-me

UPLOAD_MAX_MB=100
EXPORT_EXPIRE_HOURS=24
SEARCH_BACKEND=postgres
```

配置原则：

- `APP_PORT` 缺省为 `8089`。
- `DATABASE_URL` 必填，系统启动时必须能连接。
- `REDIS_URL` 建议必填。若缺失，只允许开发模式降级为进程内缓存，生产环境应启动失败。
- `S3_*` 建议必填。若缺失，资料上传、下载、导出能力不可用，系统应在健康检查中提示。
- 密钥类配置必须来自 `.env` 或运行环境变量，不写入代码和文档示例之外的版本库。
- 基础组件地址可以是内网 IP、域名、云服务地址或本机地址。

## 5. 后端分层

### 5.1 接口层

接口层负责：

- HTTP 路由。
- 请求解析和参数校验。
- 登录态解析。
- 邀请 token 校验。
- 统一错误返回。
- API 审计上下文注入。

接口命名建议：

```text
/api/auth/*
/api/invitations/*
/api/admin/*
/api/orgs/*
/api/users/*
/api/projects/*
/api/tasks/*
/api/assignments/*
/api/dispatch/*
/api/conflicts/*
/api/resources/*
/api/gantt/*
/api/search/*
/api/config/*
/api/reports/*
/api/tools/*
```

### 5.2 应用服务层

应用服务层编排业务用例，例如：

- 创建任务。
- 生成邀请链接。
- 处理邀请注册。
- 审核注册用户。
- 提交跨部门协调。
- 审批协调单。
- 更新分工进度。
- 提交验收。
- 归档任务。
- 计算人员负载。
- 查询甘特图数据。
- 发布配置版本。

服务层必须先做权限校验，再执行状态变更。

### 5.3 领域层

领域层承载不可绕过的规则：

- 角色和数据范围取交集。
- 隐藏项目未授权不可见。
- 跨部门派发必须审批。
- 草稿任务不占用正式工时。
- 全天任务与任意其他任务重叠都构成冲突。
- 归档任务默认只读。
- 配置模板变更不影响历史任务快照。

### 5.4 基础设施层

基础设施层负责：

- PostgreSQL 读写。
- Redis 缓存和轻量队列。
- S3 对象存储。
- 全文检索。
- 文件预签名 URL。
- 定时任务执行。
- 日志、指标和健康检查。

## 6. 数据存储策略

### 6.1 PostgreSQL

PostgreSQL 存储强一致业务数据：

- 组织、人员、项目。
- 角色、权限、授权。
- 任务、分工、进度、里程碑。
- 协调单、审批、变更记录。
- 负载快照、冲突记录。
- 资料元数据、版本、归档记录。
- 配置版本。
- 通知、待办、报表指标。
- 审计日志。

### 6.2 Redis

Redis 存储短生命周期数据：

- 登录会话。
- 权限计算缓存。
- 首页统计缓存。
- 甘特图查询结果缓存。
- 通知分发队列。
- 报表预计算任务队列。
- 幂等键和短期锁。

Redis 中的数据必须可重建，不作为唯一事实来源。

### 6.3 对象存储

对象存储保存二进制文件：

- 任务资料。
- 阶段成果附件。
- 头像或图标。
- 报表导出文件。
- 工具台处理结果文件。

数据库只保存文件元数据、对象 key、版本、权限、哈希和审计信息。

## 7. 权限架构

权限计算分三步：

1. 操作权限：用户角色是否允许执行动作。
2. 数据范围：组织、项目、任务可见性是否允许访问对象。
3. 状态约束：当前任务或资料状态是否允许动作。

所有列表查询必须在数据库查询阶段裁剪数据，不能先查全量再由前端隐藏。隐藏项目、个人事项、资料下载、报表明细和搜索结果都必须共用同一套权限裁剪。

## 8. 前后端协作

前端只承担交互和展示，不承载最终业务判断。

前端负责：

- 表单步骤。
- 人员选择和冲突提示展示。
- 甘特图渲染。
- 列表筛选、排序、列配置。
- 配置编辑器。
- 文件上传交互。

后端负责：

- 字段合法性。
- 权限判断。
- 状态流转。
- 负载计算。
- 冲突判断。
- 审批生效。
- 资料归档。
- 报表指标。

前端可以做即时预校验，但提交后以后端返回为准。

## 9. 构建与部署

### 9.1 构建产物

构建产物包括：

- `nexusflow` 可执行二进制。
- `.env` 或运行环境变量。
- 可选：数据库迁移文件，如果未内嵌。

不要求：

- Dockerfile。
- docker-compose。
- Node/Bun 运行时。
- 前端独立 Web 服务器。

### 9.2 启动检查

启动时必须检查：

- `.env` 是否可读取。
- `DATABASE_URL` 是否可连接。
- 数据库 schema 版本是否兼容。
- Redis 是否可连接。
- 对象存储是否可用。
- `APP_PORT` 是否可监听。

启动失败时应输出明确错误，不进入半可用状态。

### 9.3 健康检查

接口：

```text
GET /healthz
GET /readyz
```

`/healthz` 只检查进程存活。`/readyz` 检查数据库、Redis、对象存储和迁移版本。

## 10. 可观测性

系统应输出结构化日志：

- 请求 ID。
- 用户 ID。
- 组织范围。
- 操作类型。
- 任务 ID 或资源 ID。
- 耗时。
- 错误码。

关键指标：

- API 延迟。
- 数据库连接池占用。
- Redis 错误数。
- 文件上传失败数。
- 冲突计算耗时。
- 甘特图查询耗时。
- 审批超时数量。

## 11. 非 Docker 部署说明

系统文档和配置不得假设基础组件由 Docker 启动。开发、测试、生产都只需要提供可连接地址：

- PostgreSQL：`DATABASE_URL`。
- Redis：`REDIS_URL`。
- MinIO 或其他 S3：`S3_ENDPOINT`、`S3_BUCKET`、密钥。

如果团队已有统一数据库、缓存、对象存储平台，直接配置这些地址即可。
