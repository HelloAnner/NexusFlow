import type { Context } from "hono";
import { timingSafeEqual } from "node:crypto";
import type { ApiApp } from "../../shared/http.ts";
import { config } from "../../config.ts";
import { sql } from "../../db.ts";
import { canReadRecord, type User } from "../../permissions.ts";
import { objectRequest } from "../../storage.ts";
import { portalAllows } from "../../auth.ts";

// Portal 只读文件接口。
// 身份只来自 Portal 已验证的双 ID + 本系统 users.portal_id/portal_tenant_id 映射；
// 不接受本地 tenant/user 参数。权限沿用既有 canReadRecord 项目 ACL：
//   access_scope='uploader' -> 个人文件（仅上传者本人）
//   access_scope='project'  -> 空间文件（按项目/任务既有可见性共享）
// NexusFlow 没有独立企业表，企业归属与成员资格由 users.tenant_id + users.status 表达。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function db() { if (!sql) throw new Error("DATABASE_URL required"); return sql; }

type PortalUser = { user: User; tenantId: string };
type PortalResult = PortalUser | { status: 401 | 403 | 409 | 503; code: string };

type FileRow = {
  id: string;
  tenant_id: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  data: Record<string, any>;
};

function serviceSecretMatches(provided: string): boolean {
  const expected = config.portalInternalToken;
  if (!expected) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function mappedUser(c: Context): Promise<PortalResult> {
  if (!serviceSecretMatches(c.req.header("x-portal-internal-token") ?? "")) return { status: 401, code: "unauthorized" };
  const portalUserId = c.req.query("portal_user_id") ?? "";
  const portalTenantId = c.req.query("portal_tenant_id") ?? "";
  if (!UUID.test(portalUserId) || !UUID.test(portalTenantId)) return { status: 401, code: "invalid_identity" };
  if (!sql) return { status: 503, code: "database_unavailable" };
  const rows = await sql`SELECT u.id,u.username,u.role,u.tenant_id,u.org_id,u.portal_id,u.portal_permissions,u.status
    FROM nexusflow.portal_file_links l JOIN nexusflow.users u
      ON u.id=l.local_user_id AND u.tenant_id=l.local_tenant_id
    WHERE l.portal_user_id=${portalUserId} AND l.portal_tenant_id=${portalTenantId}
      AND l.status='active' LIMIT 1`;
  const row = rows[0];
  if (!row || row.status !== "active" || !row.tenant_id) return { status: 409, code: "portal_identity_unlinked" };
  const user:User={
    id:String(row.id),username:String(row.username),role:String(row.role),
    tenant_id:String(row.tenant_id),org_id:row.org_id??null,
    portal_permissions:row.portal_id?(Array.isArray(row.portal_permissions)?row.portal_permissions:[]):null,
  };
  if(!portalAllows(user,"/api/files","GET"))return {status:403,code:"forbidden"};
  return {tenantId:String(row.tenant_id),user};
}

function failure(c: Context, result: Exclude<PortalResult, PortalUser>) {
  return c.json({ error: result.code, code: result.code }, result.status);
}

function asRow(row: any): FileRow {
  return { id: String(row.id), tenant_id: row.tenant_id ?? null, created_by: row.created_by ?? null,
    created_at: row.created_at, updated_at: row.updated_at, data: row.data as Record<string, any> };
}

function isPersonal(data: Record<string, any>): boolean { return data.access_scope === "uploader"; }

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length || !sql) return new Map();
  const rows = await db()`SELECT id,display_name FROM nexusflow.users WHERE id = ANY(${unique})`;
  return new Map(rows.map((row: any) => [String(row.id), String(row.display_name ?? "")]));
}

function canonical(row: FileRow, scope: "personal" | "space", ownerName: string) {
  const name = String(row.data.name ?? "");
  return {
    id: row.id, source_system: "nexusflow", scope,
    name,
    path: typeof row.data.path === "string" && row.data.path ? row.data.path : name,
    mime_type: String(row.data.content_type ?? "application/octet-stream"),
    size_bytes: Number.isSafeInteger(Number(row.data.size_bytes)) ? Number(row.data.size_bytes) : 0,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    owner_name: ownerName,
  };
}

async function listFiles(c: Context) {
  const mapped = await mappedUser(c);
  if (!("user" in mapped)) return failure(c, mapped);
  const scope = c.req.query("scope") ?? "personal";
  if (scope !== "personal" && scope !== "space") return c.json({ error: "invalid scope", code: "INVALID_SCOPE" }, 400);
  const limit = Number(c.req.query("limit") ?? 50), offset = Number(c.req.query("cursor") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    return c.json({ error: "invalid pagination", code: "INVALID_PAGE" }, 400);
  }
  const rows = await db()`SELECT id,tenant_id,created_by,data,created_at,updated_at
    FROM nexusflow.records WHERE kind='files' AND tenant_id=${mapped.tenantId}
      AND coalesce(data->>'status','active')='active'
    ORDER BY created_at DESC, id DESC`;
  const visible: FileRow[] = [];
  for (const raw of rows) {
    const row = asRow(raw);
    if (scope === "personal") {
      if (isPersonal(row.data) && row.data.uploaded_by === mapped.user.id && await canReadRecord(mapped.user, "files", row)) visible.push(row);
    } else if (!isPersonal(row.data) && await canReadRecord(mapped.user, "files", row)) {
      visible.push(row);
    }
  }
  const names = await ownerNames(visible.map((row) => String(row.data.uploaded_by ?? "")));
  const page = visible.slice(offset, offset + limit);
  return c.json({
    files: page.map((row) => canonical(row, scope, names.get(String(row.data.uploaded_by ?? "")) ?? "")),
    next_cursor: offset + limit < visible.length ? String(offset + limit) : null,
  });
}

async function fileForPortal(mapped: PortalUser, id: string): Promise<FileRow | null> {
  if (!UUID.test(id)) return null;
  const rows = await db()`SELECT id,tenant_id,created_by,data,created_at,updated_at
    FROM nexusflow.records WHERE id=${id} AND kind='files' AND tenant_id=${mapped.tenantId} LIMIT 1`;
  const row = rows[0] ? asRow(rows[0]) : null;
  if (!row || row.data.status === "archived" || row.data.status === "deleted") return null;
  // 个人文件只对上传者本人可见；空间文件沿用既有项目/任务 ACL。
  if (isPersonal(row.data) && row.data.uploaded_by !== mapped.user.id) return null;
  return await canReadRecord(mapped.user, "files", row) ? row : null;
}

async function serve(c: Context, action: "content" | "preview") {
  const mapped = await mappedUser(c);
  if (!("user" in mapped)) return failure(c, mapped);
  const file = await fileForPortal(mapped, c.req.param("id") ?? "");
  if (!file) return c.json({ error: "not found", code: "NOT_FOUND" }, 404);
  const response = await objectRequest("GET", String(file.data.object_key ?? ""));
  // 内容返回前再次确认映射与权限，吊销后不继续输出。
  const again = await mappedUser(c);
  if (!("user" in again)) return failure(c, again);
  if (!await fileForPortal(again, file.id)) return c.json({ error: "not found", code: "NOT_FOUND" }, 404);
  const name = String(file.data.name ?? "download");
  const headers: Record<string, string> = {
    "content-type": String(file.data.content_type ?? "application/octet-stream"),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "content-disposition": `${action === "preview" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name.replace(/[\r\n]/g, "_"))}`,
  };
  const size = Number(file.data.size_bytes);
  if (Number.isSafeInteger(size) && size >= 0) headers["content-length"] = String(size);
  return new Response(response.body, { headers });
}

export function registerPortalFiles(app: ApiApp) {
  app.get("/api/portal/files", listFiles);
  app.get("/api/portal/files/:id/content", (c) => serve(c, "content"));
  app.get("/api/portal/files/:id/preview", (c) => serve(c, "preview"));
}

export const portalFilesPublicPath = /^\/api\/portal\/files(?:\/[^/]+\/(?:content|preview))?$/;
