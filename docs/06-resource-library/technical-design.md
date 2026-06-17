# 资料库技术设计

## 1. 后端模块

Rust 模块建议：

```text
resource
resource_version
object_storage
archive
```

模块职责：

- 管理资料元数据。
- 管理资料版本。
- 生成上传和下载预签名 URL。
- 校验任务验收前必需资料。
- 处理归档后只读规则。

## 2. 存储设计

文件内容存 S3 兼容对象存储，数据库只保存元数据。

对象 key 建议：

```text
resources/{tenant_or_center}/{resource_id}/{version_id}/{filename}
```

对象存储通过 `.env` 配置：

- `S3_ENDPOINT`。
- `S3_BUCKET`。
- `S3_ACCESS_KEY`。
- `S3_SECRET_KEY`。

## 3. 核心表

### 3.1 resource_file

字段：

- `id`。
- `name`。
- `resource_type`。
- `uploader_id`。
- `visibility`。
- `status`。
- `current_version_id`。
- `is_stage_result`。
- `is_final_result`。

### 3.2 resource_version

字段：

- `id`。
- `resource_id`。
- `version_no`。
- `object_key`。
- `file_size`。
- `content_type`。
- `sha256`。
- `uploaded_at`。

### 3.3 resource_link

字段：

- `resource_id`。
- `object_type`：task、assignment、project。
- `object_id`。

### 3.4 resource_requirement

任务模板或项目模板要求的必需资料。

## 4. API

```text
GET  /api/resources
GET  /api/resources/{id}
POST /api/resources/upload-url
POST /api/resources/complete-upload
POST /api/resources/{id}/versions
GET  /api/resources/{id}/download-url
POST /api/resources/{id}/link
POST /api/resources/{id}/archive
GET  /api/resources/check-requirements
```

## 5. 权限

- 资料继承关联任务、分工、项目的可见性。
- 隐藏项目资料未授权不可搜索、不可下载。
- 上传资料需要关联对象的编辑或提交成果权限。
- 最终成果标记需要负责人或验收人权限。
- 归档资料下载必须审计。

## 6. 事件

发布：

- `resource.upload_requested`。
- `resource.uploaded`。
- `resource.version_created`。
- `resource.linked`。
- `resource.archived`。

消费：

- 任务验收校验资料完整性。
- 搜索模块更新资料索引。
- 报表模块更新资料归档完整率。

## 7. 前端实现

- 上传采用预签名 URL 直传对象存储。
- 上传完成后调用后端完成接口写入元数据。
- 资料卡片展示当前版本、状态、关联任务和成果标记。
- 资料详情展示版本历史。
- 归档后隐藏覆盖上传，只允许授权补充新版本。

