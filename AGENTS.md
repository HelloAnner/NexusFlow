<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://101.200.138.250:8089/
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>

## 项目部署与测试约定

- 系统默认部署环境是服务器 `ssh nexusflow`。
- 默认服务端口是 `8089`。
- 不在本地做部署；组件、依赖安装和运行环境都以服务器为准。
- 部署默认直接运行仓库根目录的 `make deploy`，不要手工拆解成 rsync、cargo build、systemctl restart 等零散步骤。
- `make deploy` 当前已验证可用：本地构建前端、刷新 Rust vendor、同步到 `ssh nexusflow:/opt/nexusflow/src`、在服务器容器/Podman 环境中构建单文件二进制、重启 `nexusflow.service`，最后执行健康检查。
- 服务器运行入口是 `/opt/nexusflow/nexusflow`，systemd 服务为 `nexusflow.service`，源码同步目录是 `/opt/nexusflow/src`。
- 服务器本机没有直接暴露 Rust/Node 命令；不要因为 `ssh nexusflow 'rustc --version'` 或 `node --version` 不存在就改走本机部署。构建由 `make deploy` 内部脚本处理。
- macOS 本机不要尝试手工交叉编译 Linux 二进制；容易卡在 `x86_64-linux-gnu-gcc` / `ring` / `aws-lc-sys` 链接工具链。需要部署时直接 `make deploy`。
- 功能测试默认也在服务器 `ssh nexusflow` 上进行，不以本地环境作为验收依据。
- 超级管理员账号：`Anner`。
- 超级管理员密码：`1`。

## 前端修改与样式约定

- 所有涉及界面、布局、配色的改动，必须先在 `docs/pages/` 下完成 Markdown 描述，明确页面/组件的功能、结构与交互。
- 完成 Markdown 描述后，再通过 `pencil` MCP 修改 `nexusflow.pen`，将设计稿与文档描述对齐。
- `nexusflow.pen` 作为唯一的视觉/交互设计源，前端代码应当严格对齐该源文件中的变量、组件与排版。
- 前端实现顺序：先写 `docs/pages/` 文档，再改 `@nexusflow.pen`，然后改 `frontend/` 源码，最后改 Rust 后端。

## 修改与部署流程

1. **文档先行**：在 `docs/pages/` 下新增或更新 Markdown，描述页面/组件的功能、交互、字段与状态。
2. **设计稿对齐**：使用 `pencil` MCP 修改并保存 `nexusflow.pen`，确认设计稿与文档描述一致后再进入编码阶段。
3. **前端实现**：依据 `nexusflow.pen` 中的设计变量与组件，修改 `frontend/src` 下对应代码。
4. **后端实现**：根据前端需要的接口与数据结构，修改 `backend/src` 下对应代码，遵循后端代码组织约定。
5. **自动部署**：后端与前端的修改完成后，在仓库根目录运行 `make deploy` 自动发布到服务器 `ssh nexusflow`（默认端口 `8089`）。不要绕过 Makefile 手写部署命令，除非正在修复部署脚本本身。

## Rust 后端代码组织约定

- `backend/src/main.rs` 只保留入口、顶层引用和模块装配，不堆叠具体领域实现。
- 后端实现按领域/功能拆分到 `backend/src/app`、`backend/src/shared`、`backend/src/domains` 等目录。
- 任意单个 `.rs` 文件不得超过 500 行；新增或重构代码时必须先拆文件再扩展实现。
