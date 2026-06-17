<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37701
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>

## 项目部署与测试约定

- 系统默认部署环境是服务器 `ssh nexusflow`。
- 默认服务端口是 `8089`。
- 不在本地做部署；组件、依赖安装和运行环境都以服务器为准。
- 功能测试默认也在服务器 `ssh nexusflow` 上进行，不以本地环境作为验收依据。
- 超级管理员账号：`Anner`。
- 超级管理员密码：`1`。

## Rust 后端代码组织约定

- `backend/src/main.rs` 只保留入口、顶层引用和模块装配，不堆叠具体领域实现。
- 后端实现按领域/功能拆分到 `backend/src/app`、`backend/src/shared`、`backend/src/domains` 等目录。
- 任意单个 `.rs` 文件不得超过 500 行；新增或重构代码时必须先拆文件再扩展实现。
