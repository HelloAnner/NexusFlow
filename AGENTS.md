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

## Git、Worktree 与并行开发规范

### 主分支职责

- 本仓库的交付主分支是 `main`；执行任何集成前仍需用 `origin/HEAD` 核对远端默认分支，避免默认分支变更后继续按旧配置操作。
- `main` 是唯一允许推送到 `origin` 的分支。功能分支只作为本地 worktree 的临时载体，不得直接推送功能分支，也不得从功能 worktree 向远端提交代码。
- `main` 只负责串行集成、推送、部署和服务器验收，不用于较大功能的日常开发；主工作区应始终停留在 `main` 并尽量保持干净。
- 每次开始集成前必须先 `git fetch origin`，确认主工作区没有未提交改动，再以 fast-forward-only 方式把本地 `main` 同步到最新 `origin/main`。不得用强制切换、强制重置或强制推送覆盖本地或远端改动。
- 只有已经提交、合并并推送到 `origin/main` 的内容才算进入主分支交付历史；仅存在于工作区、stash、未合并分支或其他 worktree 的改动不算已经进入 `main`。

### 自动 Commit 与 Push

- 每个功能完成后，Codex 必须自动完成提交、主分支集成和远端推送，不需要等待用户再次要求或确认 `commit`、合并、`push`。除非出现无法安全处理的冲突、认证失败、远端拒绝、服务器验收失败等真实阻塞，否则不得把这些收尾步骤留给用户。
- 自动化顺序固定为：在功能 worktree 提交功能改动 → 串行集成到最新 `main` → 从 `main` 推送 `origin/main` → 从干净且最新的 `main` 部署 → 在服务器验证。不得直接推送功能分支，也不得把未提交改动部署到服务器。
- 服务器验证中发现问题时，必须继续在对应功能 worktree 中修复，并再次自动执行“提交 → 集成 `main` → 推送 `origin/main` → 部署 → 服务器验证”的完整循环，直到通过；不能只在服务器临时修改而不回写仓库。
- 宣布功能完成前必须做最终核对：功能及验收修复没有未提交改动，对应提交已包含在本地 `main` 和 `origin/main` 中，两者指向一致，并且该提交对应的服务器版本已经通过验证。
- 自动提交只包含当前功能明确范围内的文件；用户已有的无关改动不得擅自提交、暂存、丢弃或混入功能提交。

### 一个较大功能对应一个 Worktree

- 每个较大的独立功能必须从最新 `main` 创建独立的临时本地分支和独立 worktree，做到一个功能、一个分支、一个 worktree；不同功能不得共用工作区或混合提交。
- 多个互不依赖的功能可以在各自 worktree 中并行开发，但各自只修改、暂存和提交本功能相关文件，不得带入用户已有改动或其他功能改动。
- 功能 worktree 内完成代码和必要文档后，应创建内容明确的本地 commit，并保持 worktree 干净，然后进入主分支集成队列。
- 小型且不改变运行功能的纯文档/流程维护可以直接在 `main` 上完成，但必须只暂存和提交本次相关文件；如果主工作区已有无关改动，优先改用独立 worktree，不能把无关改动混入同一提交。

### 依赖、冲突与串行队列

- 功能开发可以并行，但“同步最新 `main` → 合并 → 推送 → 部署 → 服务器验收”必须全局串行；任何时刻只能有一个功能占用主分支集成和部署通道。
- 如果功能 B `Depends On` 功能 A，B 必须等待 A 已合并到 `main`、成功推送、部署并通过服务器验收后，再把 B rebase 到最新 `main`，继续开发或进入集成队列。
- 如果多个功能修改同一区域、存在顺序要求或出现冲突，将它们加入同一串行队列。后续功能必须基于前一个功能已经验收的最新 `main` 重新 rebase，并在自己的 worktree 中理解双方意图后解决冲突；禁止机械使用 `ours`、`theirs` 或覆盖文件。
- 无法安全判断依赖关系或冲突解决方式时，停止该功能的集成并向用户说明；队列中不依赖它且不会扩大风险的其他功能可以继续。

### 单个功能的交付闭环

1. 在该功能的 worktree 内完成修改，检查变更范围，自动提交本功能相关文件，并确保 worktree 干净；不等待用户另行要求提交。
2. 进入串行集成队列；重新 fetch 远端，并把功能分支 rebase 到最新、干净且与 `origin/main` 同步的本地 `main`。
3. 在主工作区使用 `git merge --ff-only <功能分支>` 集成，禁止产生无意的 merge commit；无法 fast-forward 时返回功能 worktree 重新 rebase。
4. 自动从主工作区执行 `git push origin main`，不等待用户另行要求推送。如果远端新增提交导致推送失败，重新 fetch、同步、rebase 和验证，禁止 force push。
5. 确认本地主工作区干净且 `HEAD` 与 `origin/main` 一致后，从主工作区执行 `make deploy`，将这个功能单独部署到 `ssh nexusflow`。
6. 在服务器环境和默认端口 `8089` 完成功能检查与健康检查；本地运行结果不得作为验收结论。
7. 只有在全部功能改动和验收修复都已提交、进入 `origin/main`，且服务器部署与功能验收均成功后，该功能才算结束。随后安全移除对应 worktree，并删除已经完全合并的临时本地分支。
8. 如果同步、rebase、推送、部署或服务器验收失败，保留该功能的 worktree 和分支，修复后重新排队；不得跳过失败步骤、不得带着脏工作区部署，也不得先清理未完成的 worktree。

## 项目部署与测试约定

- 系统默认部署环境是服务器 `ssh nexusflow`。
- 默认服务端口是 `8089`。
- 本地不单独执行构建、测试、启动服务或功能验收命令；本地只负责编辑代码、Git/worktree 操作，以及从干净且最新的 `main` 发起 `make deploy`。`make deploy` 内部已有的必要步骤属于统一部署流程，不得拆出来手工运行或据此做本地验收。
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
