import { config } from "../../config.ts";
import { sql } from "../../db.ts";
import { actor, canManage, canManageOrganization, featureDenied, type User } from "../../permissions.ts";
import { getRecord } from "../../records.ts";
import { addAudit } from "../../shared/audit.ts";
import { hashText } from "../../shared/hash.ts";
import type { ApiApp } from "../../shared/http.ts";

export const invitationUrl = (token: string) => `${config.basePath}/register#token=${encodeURIComponent(token)}`;
export const invitationRoles = (user: User) => ["member", "project_lead", ...(["super_admin", "center_director"].includes(user.role) ? ["department_deputy", "department_director", "center_deputy"] : [])];

export async function assertInvitationScope(user: User, role: string, orgId: string) {
  if (!sql) throw Error("DATABASE_URL required");
  if (config.loginMode === "portal") throw Error("forbidden: local registration disabled; invite through Portal");
  if (!canManage(user) || featureDenied(user, "people", "manage") || !invitationRoles(user).includes(role)) throw Error("forbidden: invitation role not allowed");
  const orgs = await sql`SELECT id FROM nexusflow.records WHERE id::text=${orgId} AND kind='orgs' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'enabled' IS DISTINCT FROM 'false'`;
  if (!orgs[0]) throw Error("invalid invitation organization");
  if (!["super_admin", "center_director"].includes(user.role) && !await canManageOrganization(user, orgId)) throw Error("forbidden: invitation organization outside your scope");
}

export function registerInvitationRoutes(app: ApiApp) {
  app.post("/api/auth/invitations/validate", async (c) => {
    if (config.loginMode === "portal") return c.json({ error: "local registration disabled" }, 403);
    if (!sql) return c.json({ error: "authentication services unavailable" }, 503);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.token !== "string" || !body.token || body.token.length > 200) return c.json({ valid: false });
    const hash = await hashText(body.token);
    const rows = await sql`SELECT i.data, o.data->>'name' AS org_name FROM nexusflow.records i
      JOIN nexusflow.records o ON o.id::text=i.data->>'org_id' AND o.kind='orgs' AND o.tenant_id IS NOT DISTINCT FROM i.tenant_id
      WHERE i.kind='invitations' AND i.data->>'token_hash'=${hash} AND i.data->>'status'='active'
      AND (i.data->>'expires_at')::timestamptz>now() AND o.data->>'enabled' IS DISTINCT FROM 'false' LIMIT 1`;
    const invite = rows[0];
    c.header("cache-control", "no-store");
    return c.json(invite ? { valid: true, role: invite.data.role, org_name: invite.org_name, expires_at: invite.data.expires_at } : { valid: false });
  });

  app.post("/api/invitations/:id/resend", async (c) => {
    const user = actor(c);
    if (!sql) return c.json({ error: "DATABASE_URL required" }, 503);
    const visible = await getRecord(user, "invitations", c.req.param("id"));
    if (!visible) return c.json({ error: "not found" }, 404);
    const token = crypto.randomUUID() + crypto.randomUUID(), token_hash = await hashText(token);
    const result = await sql.begin(async (tx) => {
      const rows = await tx`SELECT id,data FROM nexusflow.records WHERE id=${visible.id} AND kind='invitations' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw Error("invitation not found");
      const data = row.data as Record<string, any>;
      if (data.status === "used") throw Error("invitation already used");
      await assertInvitationScope(user, String(data.role), String(data.org_id));
      const expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
      await tx`UPDATE nexusflow.records SET data=data||${tx.json({ token_hash, expires_at, status: "active", revoked_at: null, revoked_by: null } as any)},updated_at=now() WHERE id=${row.id}`;
      await addAudit(tx, user, "invitation.resend", "invitations", String(row.id));
      return { id: row.id, role: data.role, org_id: data.org_id, expires_at, status: "active" };
    });
    c.header("cache-control", "no-store");
    return c.json({ invitation: result, token, invite_url: invitationUrl(token) });
  });
}
