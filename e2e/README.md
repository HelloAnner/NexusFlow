# NexusFlow E2E 测试用例库

本目录按 `docs/` 的目标产品形态编写全量 e2e 用例，不以当前实现完成度缩减范围。执行时默认测试服务器环境：

- 服务器：`ssh nexusflow`
- 服务地址：`http://localhost:8089` 或服务器可访问的 `APP_PUBLIC_URL`
- 超级管理员：`Anner`
- 密码：`1`
- 浏览器工具：`agent-browser`

## 通过标准

每条用例必须同时满足：

1. 页面路径通过真浏览器完成，不能只用接口模拟。
2. 每个关键页面状态、弹窗、表单提交结果、列表变化、权限提示都保存截图。
3. 与页面行为对应的 API 必须返回期望状态码、关键字段和后置数据。
4. 涉及权限、隐藏项目、待审核用户、跨部门、资料可见性的用例必须用不同角色复验。
5. 当前实现缺失时，结果记为 `BLOCKED_BY_IMPLEMENTATION`，不能记为通过。

## 推荐截图路径

截图按用例 ID 存放：

```text
e2e/artifacts/{run-id}/{case-id}/01-login.png
e2e/artifacts/{run-id}/{case-id}/02-before-action.png
e2e/artifacts/{run-id}/{case-id}/03-after-action.png
e2e/artifacts/{run-id}/{case-id}/04-api-confirmation.png
```

API 响应原文或裁剪后的 JSON 存放：

```text
e2e/artifacts/{run-id}/{case-id}/api.json
```

## 执行流程

1. 登录服务器并确认服务健康：`curl http://127.0.0.1:8089/healthz`、`curl http://127.0.0.1:8089/readyz`。
2. 使用 `agent-browser open http://127.0.0.1:8089/login` 打开页面。
3. 按用例步骤操作，所有页面状态用 `agent-browser screenshot` 保存。
4. 用登录 token 调用 API 验证业务数据和权限裁剪。
5. 将结果写入 `e2e/artifacts/{run-id}/results.md`。

## 文件说明

- [execution-standard.md](./execution-standard.md)：执行、截图和 API 判定规范。
- [api-inventory.md](./api-inventory.md)：全量 API 验证清单。
- [roles.md](./roles.md)：全量角色账号矩阵。
- [test-data-plan.md](./test-data-plan.md)：全量测试数据方案。
- [execution-plan.md](./execution-plan.md)：517 条用例的分批执行顺序。
- [automation-contract.md](./automation-contract.md)：后续自动化脚本必须遵守的输出和证据契约。
- [result-template.md](./result-template.md)：每次运行的结果记录模板。
- [coverage-matrix.md](./coverage-matrix.md)：模块覆盖矩阵。
- [cases/](./cases)：按模块拆分的 e2e 用例。
- [bin/](./bin)：运行目录、健康检查、登录 API 和 agent-browser smoke 脚本模板。

## 脚本模板

创建一次运行目录：

```bash
e2e/bin/nf-e2e-new-run.sh
```

检查服务器健康：

```bash
BASE_URL=http://127.0.0.1:8089 e2e/bin/nf-e2e-health.sh e2e/artifacts/{run-id}
```

保存 SA 登录 API 响应：

```bash
BASE_URL=http://127.0.0.1:8089 e2e/bin/nf-e2e-login-api.sh e2e/artifacts/{run-id}/api-login.json
```

采集登录页 agent-browser smoke 证据：

```bash
BASE_URL=http://127.0.0.1:8089 e2e/bin/nf-e2e-agent-login-smoke.sh e2e/artifacts/{run-id}
```
