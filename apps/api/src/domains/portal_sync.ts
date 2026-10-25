// Portal 租户/账号同步内部接口（NexusFlow）。
// 只接受 X-Portal-Internal-Token；不参与本地 JWT / Portal SSO 鉴权。
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { ApiApp } from "../shared/http.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { revokeUserSessions } from "../auth.ts";

const PREFIX = "/api/portal/sync/v1";

function tokenOk(provided: string): boolean {
  const expected = config.portalInternalToken;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return Boolean(expected && a.length === b.length && timingSafeEqual(a, b));
}

function text(value: unknown, label: string, max = 128): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    throw new Error(`invalid ${label}`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, max = 128): string | null {
  if (value === undefined || value === null || value === "") return null;
  return text(value, label, max);
}

function canonicalRole(value: unknown): "tenant_owner" | "tenant_admin" | "user" {
  if (value === "tenant_owner" || value === "tenant_admin") return value;
  return "user";
}

function canonicalRoles(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const out = new Set<string>();
  for (const role of list) {
    if (role === "tenant_owner" || role === "tenant_admin" || role === "user") out.add(role);
  }
  return out.size ? [...out] : ["user"];
}

function localRole(canonical: "tenant_owner" | "tenant_admin" | "user"): string {
  return canonical === "user" ? "member" : "center_director";
}

function reverseRole(role: string): string {
  if (role === "center_director") return "tenant_admin";
  if (role === "center_deputy" || role === "department_director" || role === "department_deputy") return "tenant_admin";
  return "user";
}

function memberStatus(value: unknown): "active" | "suspended" | "removed" {
  if (value === "suspended" || value === "removed") return value;
  return "active";
}

function localStatus(value: "active" | "suspended" | "removed"): "active" | "disabled" {
  return value === "active" ? "active" : "disabled";
}

function tenantStatus(value: unknown): string {
  if (value === "pending" || value === "suspended" || value === "archived" || value === "deletion_pending") return value;
  return "active";
}

const uuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function fail(c: any, status: number, error: string, message: string) {
  return c.json({ error, message }, status);
}

export function registerPortalSync(app: ApiApp): void {
  app.get(`${PREFIX}/health`, (c) => {
    if (!tokenOk(c.req.header("X-Portal-Internal-Token") ?? "")) return fail(c, 404, "not_found", "Not found");
    return c.json({ ok: true, system_code: "nexusflow", db: sql ? "ok" : "unavailable", server_time: new Date().toISOString() });
  });

  app.get(`${PREFIX}/capabilities`, (c) => {
    if (!tokenOk(c.req.header("X-Portal-Internal-Token") ?? "")) return fail(c, 404, "not_found", "Not found");
    return c.json({
      version: 1,
      system_code: "nexusflow",
      features: ["tenants.list", "tenants.upsert", "members.list", "members.upsert", "members.link", "sessions.revoke"],
      limits: { page_size: 500, max_body_bytes: 1048576 },
      server_time: new Date().toISOString(),
    });
  });

  app.get(`${PREFIX}/tenants`, async (c) => {
    if (!tokenOk(c.req.header("X-Portal-Internal-Token") ?? "")) return fail(c, 404, "not_found", "Not found");
    if (!sql) return fail(c, 503, "db_unavailable", "database unavailable");
    const rows = await sql`
      SELECT t.id,t.code,t.name,t.status,t.created_at,t.updated_at,
        (SELECT COUNT(*) FROM nexusflow.users u WHERE u.tenant_id=t.id AND u.status='active' AND u.role<>'super_admin')::int AS member_count
      FROM nexusflow.tenants t ORDER BY t.created_at
    `;
    return c.json({
      items: rows.map((row: any) => ({
        local_tenant_id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        status: String(row.status ?? "active"),
        member_count: Number(row.member_count ?? 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      next_cursor: null,
      server_time: new Date().toISOString(),
    });
  });

  app.get(`${PREFIX}/tenants/:id/members`, async (c) => {
    if (!tokenOk(c.req.header("X-Portal-Internal-Token") ?? "")) return fail(c, 404, "not_found", "Not found");
    if (!sql) return fail(c, 503, "db_unavailable", "database unavailable");
    const rows = await sql`
      SELECT id,username,display_name,role,status,portal_id,updated_at
      FROM nexusflow.users
      WHERE tenant_id=${c.req.param("id")} AND role<>'super_admin'
      ORDER BY lower(username)
    `;
    return c.json({
      items: rows.map((row: any) => ({
        local_user_id: String(row.id),
        username: String(row.username),
        display_name: String(row.display_name ?? row.username),
        email: null,
        status: row.status === "active" ? "active" : "removed",
        roles: [reverseRole(String(row.role))],
        portal_user_id: row.portal_id ? String(row.portal_id) : null,
        updated_at: row.updated_at,
      })),
      next_cursor: null,
      server_time: new Date().toISOString(),
    });
  });

  app.post(`${PREFIX}/tenants`, async (c) => {
    if (!tokenOk(c.req.header("X-Portal-Internal-Token") ?? "")) return fail(c, 404, "not_found", "Not found");
    if (!sql) return fail(c, 503, "db_unavailable", "database unavailable");
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const portalTenantId = text(body.portal_tenant_id, "portal_tenant_id", 64);
      const code = text(body.code, "code", 64);
      const name = text(body.name, "name", 128);
      const status = tenantStatus(body.status);

      const existing = await sql`SELECT id,portal_tenant_id FROM nexusflow.tenants WHERE code=${code} LIMIT 1`;
      let localId = existing[0]?.id ? String(existing[0].id) : "";
      let created = false;
      if (!localId) {
        const byPortal = await sql`SELECT id FROM nexusflow.tenants WHERE portal_tenant_id=${portalTenantId} LIMIT 1`;
        if (byPortal[0]?.id) {
          localId = String(byPortal[0].id);
          await sql`UPDATE nexusflow.tenants SET code=${code},name=${name},status=${status},updated_at=now() WHERE id=${localId}`;
        } else {
          localId = uuid(portalTenantId) ? portalTenantId : crypto.randomUUID();
          const conflict = await sql`SELECT id FROM nexusflow.tenants WHERE id=${localId} LIMIT 1`;
          if (conflict.length) localId = crypto.randomUUID();
          await sql`
            INSERT INTO nexusflow.tenants (id,code,name,status,portal_tenant_id)
            VALUES (${localId},${code},${name},${status},${portalTenantId})
          `;
          created = true;
        }
      } else {
        const linked = existing[0]?.portal_tenant_id ? String(existing[0].portal_tenant_id) : "";
        if (linked && linked !== portalTenantId) {
          return fail(c, 409, "tenant_code_conflict", "tenant code belongs to another portal tenant");
        }
        await sql`
          UPDATE nexusflow.tenants
          SET name=${name},status=${status},portal_tenant_id=COALESCE(portal_tenant_id,${portalTenantId}),updated_at=now()
          WHERE id=${localId}
        `;
      }
      if (status !== "active") {
        const active = await sql`
          SELECT id FROM nexusflow.users WHERE tenant_id=${localId} AND status='active'
        `;
        await sql`
          UPDATE nexusflow.users SET status='disabled', updated_at=now()
          WHERE tenant_id=${localId} AND status='active'
        `;
        for (const row of active) {
          try { await revokeUserSessions(String(row.id)); } catch { /* session store unavailable */ }
        }
      }
      return c.json({ local_tenant_id: localId, created, code, status });
    } catch (error) {
      return fail(c, 422, "invalid_request", error instanceof Error ? error.message : String(error));
    }
  });

  app.put(`${PREFIX}/tenants/:id/members/:portalUserId`, async (c) => {
    if (!tokenOk(c.req.header("X-Portal-Internal-Token") ?? "")) return fail(c, 404, "not_found", "Not found");
    if (!sql) return fail(c, 503, "db_unavailable", "database unavailable");
    try {
      const localTenantId = c.req.param("id");
      const portalUserId = c.req.param("portalUserId");
      const body = await c.req.json() as Record<string, unknown>;
      const username = text(body.username, "username", 64);
      const displayName = optionalText(body.display_name, "display_name", 128) ?? username;
      const role = localRole(canonicalRole(canonicalRoles(body.roles)[0]));
      const status = memberStatus(body.status);

      const tenant = await sql`SELECT id,name,status FROM nexusflow.tenants WHERE id=${localTenantId} LIMIT 1`;
      if (!tenant[0]) return fail(c, 404, "tenant_not_found", "tenant not found");

      let localUserId = "";
      let created = false;
      let recovered = false;
      const linked = await sql`
        SELECT id,username FROM nexusflow.users
        WHERE portal_id=${portalUserId} AND portal_tenant_id=${localTenantId} LIMIT 1
      `;
      if (linked[0]?.id) {
        localUserId = String(linked[0].id);
      } else {
        const byUsername = await sql`
          SELECT id,role FROM nexusflow.users
          WHERE lower(username)=lower(${username}) AND tenant_id=${localTenantId} LIMIT 1
        `;
        if (byUsername[0]?.id) {
          localUserId = String(byUsername[0].id);
          if (String(byUsername[0].role) === "super_admin") return fail(c, 409, "super_admin_forbidden", "cannot map super admin");
          recovered = true;
        } else {
          localUserId = crypto.randomUUID();
          const passwordHash = await bcrypt.hash(`portal:${portalUserId}:${crypto.randomUUID()}`, 12);
          await sql`
            INSERT INTO nexusflow.users
              (id,username,password_hash,display_name,role,tenant_id,org_id,status,portal_id,portal_tenant_id,portal_permissions)
            VALUES (${localUserId},${username},${passwordHash},${displayName},${role},${localTenantId},NULL,${localStatus(status)},${portalUserId},${localTenantId},'{}')
          `;
          created = true;
        }
      }

      await sql`
        UPDATE nexusflow.users SET
          display_name=${displayName}, role=${role}, status=${localStatus(status)},
          portal_id=${portalUserId}, portal_tenant_id=${localTenantId}, updated_at=now()
        WHERE id=${localUserId}
      `;

      let revoked = 0;
      if (status !== "active") {
        try {
          await revokeUserSessions(localUserId);
          revoked = 1;
        } catch {
          revoked = 0;
        }
      }
      return c.json({
        local_user_id: localUserId,
        local_tenant_id: localTenantId,
        local_username: username,
        created,
        linked: !created,
        status,
        roles: [canonicalRole(canonicalRoles(body.roles)[0])],
        sessions_revoked: revoked,
        ...(recovered ? { recovered_existing_user: true } : {}),
      });
    } catch (error) {
      return fail(c, 422, "invalid_request", error instanceof Error ? error.message : String(error));
    }
  });

  app.post(`${PREFIX}/tenants/:id/members/:portalUserId/link`, async (c) => {
    if (!tokenOk(c.req.header("X-Portal-Internal-Token") ?? "")) return fail(c, 404, "not_found", "Not found");
    if (!sql) return fail(c, 503, "db_unavailable", "database unavailable");
    try {
      const localTenantId = c.req.param("id");
      const portalUserId = c.req.param("portalUserId");
      const body = await c.req.json() as Record<string, unknown>;
      if (body.confirm !== true) return fail(c, 422, "confirm_required", "confirm=true required");
      text(body.reason, "reason", 500);
      const localUserId = text(body.local_user_id, "local_user_id", 64);

      const member = await sql`
        SELECT id,username,role FROM nexusflow.users
        WHERE id=${localUserId} AND tenant_id=${localTenantId} LIMIT 1
      `;
      if (!member[0]?.id) return fail(c, 404, "local_user_not_found", "local user not found");
      if (String(member[0].role) === "super_admin") return fail(c, 409, "super_admin_forbidden", "cannot map super admin");

      const existing = await sql`
        SELECT portal_id FROM nexusflow.users
        WHERE id=${localUserId} AND portal_id IS NOT NULL LIMIT 1
      `;
      if (existing[0]?.portal_id && String(existing[0].portal_id) !== portalUserId) {
        return fail(c, 409, "local_user_already_linked", "local user already linked");
      }
      await sql`
        UPDATE nexusflow.users
        SET portal_id=${portalUserId}, portal_tenant_id=${localTenantId}, updated_at=now()
        WHERE id=${localUserId}
      `;
      return c.json({ linked: true, local_user_id: localUserId, local_username: String(member[0].username) });
    } catch (error) {
      return fail(c, 422, "invalid_request", error instanceof Error ? error.message : String(error));
    }
  });
}
