import type { Client } from "./client";
import { option, type CliArgs } from "./args";

export async function portalSync(client: Client, args: CliArgs) {
  const token = process.env.PORTAL_INTERNAL_TOKEN || option(args, "service-token");
  if (!token) throw Error("PORTAL_INTERNAL_TOKEN is required");
  const headers = { "x-portal-internal-token": token, "x-portal-sync-version": "1" };
  const action = args.action;
  if (action === "status") {
    return {
      health: await client.json("/api/portal/sync/v1/health", "GET", undefined, headers),
      capabilities: await client.json("/api/portal/sync/v1/capabilities", "GET", undefined, headers),
    };
  }
  if (action === "tenants") {
    return client.json("/api/portal/sync/v1/tenants", "GET", undefined, headers);
  }
  if (action === "members") {
    const tenantId = option(args, "tenant-id");
    if (!tenantId) throw Error("portal-sync members requires --tenant-id");
    return client.json(`/api/portal/sync/v1/tenants/${encodeURIComponent(tenantId)}/members`, "GET", undefined, headers);
  }
  if (action === "selftest") {
    const health = await client.json("/api/portal/sync/v1/health", "GET", undefined, headers);
    const capabilities = await client.json("/api/portal/sync/v1/capabilities", "GET", undefined, headers);
    const tenants = await client.json("/api/portal/sync/v1/tenants", "GET", undefined, headers);
    const first = Array.isArray(tenants.items) ? tenants.items[0] : null;
    const members = first?.local_tenant_id
      ? await client.json(`/api/portal/sync/v1/tenants/${encodeURIComponent(String(first.local_tenant_id))}/members`, "GET", undefined, headers)
      : { items: [] };
    return {
      ok: health.ok === true && capabilities.version === 1,
      system_code: capabilities.system_code,
      tenants: Array.isArray(tenants.items) ? tenants.items.length : 0,
      members_checked: Array.isArray(members.items) ? members.items.length : 0,
    };
  }
  throw Error("portal-sync supports status|tenants|members|selftest");
}
