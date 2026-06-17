# 自动化落地契约

当前 `cases/*.md` 是全量验收用例库。后续写自动化脚本时必须遵守本契约，不能因为脚本实现方便而降低通过标准。

## 自动化分层

| 层 | 目标 | 工具 |
| --- | --- | --- |
| Browser E2E | 真浏览器操作、截图、页面断言 | `agent-browser` |
| API Assert | 状态码、JSON、后置查询、权限裁剪 | `curl` 或项目内测试工具 |
| Data Setup | 创建角色、组织、项目、任务、资料、冲突 | 后端 API 或专用 seed 脚本 |
| Result Report | 汇总状态、截图链接、API 证据、缺陷 | Markdown/JSON |

## 用例脚本命名

自动化脚本建议按模块拆分：

```text
e2e/scripts/00-global-auth-navigation.*
e2e/scripts/01-organization-personnel.*
...
e2e/scripts/13-admin-auth.*
```

每条脚本输出必须包含：

```json
{
  "case_id": "E2E-00-002",
  "status": "PASS",
  "screenshots": [
    "e2e/artifacts/20260617-001/E2E-00-002/01-login.png"
  ],
  "api_evidence": [
    "e2e/artifacts/20260617-001/E2E-00-002/api.json"
  ],
  "notes": ""
}
```

## 截图命名

截图必须按动作顺序编号：

- `01-login.png`
- `02-entry.png`
- `03-before-action.png`
- `04-action-dialog.png`
- `05-after-action.png`
- `06-api-confirmation.png`
- `07-error-state.png`

如果用例不需要某一步，可以跳号，但不能覆盖已有截图。

## API 证据命名

- `api-login.json`
- `api-before.json`
- `api-action.json`
- `api-after.json`
- `api-permission-denied.json`

## 阻塞处理

如果页面或 API 不存在：

1. 截图当前页面或 404/403/空态。
2. 保存 API 响应。
3. 结果记为 `BLOCKED_BY_IMPLEMENTATION`。
4. 在结果备注写清楚缺失项，例如：`missing page: /projects/:id members tab`。

不能跳过，也不能记为 PASS。

## 禁止事项

- 禁止只跑 API 后认为 e2e 通过。
- 禁止没有截图的 PASS。
- 禁止使用本地开发服务作为验收目标。
- 禁止用 SA 账号代替普通角色做权限测试。
- 禁止把 500、白屏、空响应归类为实现缺失；这类属于失败。

