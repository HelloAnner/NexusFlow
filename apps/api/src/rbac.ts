// NexusFlow 统一 RBAC：权限覆盖、目录、矩阵、本地接口与 Portal 内部接口。
import { timingSafeEqual } from "node:crypto";
import type { ApiApp } from "./shared/http.ts";
import { config } from "./config.ts";
import { sql } from "./db.ts";

function db(): NonNullable<typeof sql> {
  if (!sql) throw new Error("database unavailable");
  return sql;
}
import type { User } from "./permissions.ts";
import {
  NEXUSFLOW_FEATURES,
  buildCatalog,
  canManageRole,
  featureActions,
  featureCells,
  featureGate,
  grantActions,
  overrideMap,
  portalGate,
  projectCells,
  validateTarget,
  type ProjectContext,
  type ProjectLike,
  type RbacAction,
  type RbacCell,
  type RbacEffect,
  type RbacGate,
  type RbacMatrix,
  type RbacOverride,
  type RbacSubject,
} from "./rbac_core.ts";

type Row = Record<string, unknown>;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function tokenOk(provided: string): boolean {
  const expected = config.portalInternalToken;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return Boolean(expected && a.length === b.length && timingSafeEqual(a, b));
}

export function actionOf(value: unknown): RbacAction {
  if (value === 'view' || value === 'edit' || value === 'manage') return value;
  throw new Error('action must be view / edit / manage');
}

export function effectOf(value: unknown): RbacEffect | null {
  if (value === null || value === undefined) return null;
  if (value === 'allow' || value === 'deny') return value;
  throw new Error('effect must be allow / deny / null');
}

async function loadOverrides(tenantId: string, userId: string): Promise<RbacOverride[]> {
  if (!sql) return [];
  const rows = await db()`
    SELECT entity_type, entity_id, action, effect
      FROM nexusflow.permission_override
     WHERE tenant_id = ${tenantId} AND subject_type = 'user' AND subject_id = ${userId}
  `;
  return rows.map((row) => ({
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    action: String(row.action) as RbacAction,
    effect: String(row.effect) === 'deny' ? 'deny' : 'allow',
  }));
}

/** 每个请求加载一次：功能禁用 + 项目覆盖，供 permissions.ts 同步判断。 */
export async function withRbacContext(user: User): Promise<User> {
  if (!sql || !user.tenant_id) return user;
  const overrides = await loadOverrides(user.tenant_id, user.id);
  if (overrides.length === 0) return user;
  const featureDenies: string[] = [];
  const projectOverrides: Record<string, Record<string, 'allow' | 'deny'>> = {};
  for (const override of overrides) {
    if (override.entity_type === 'feature' && override.effect === 'deny') {
      featureDenies.push(`${override.entity_id}:${override.action}`);
    }
    if (override.entity_type === 'project') {
      const existing = projectOverrides[override.entity_id] ?? {};
      existing[override.action] = override.effect;
      projectOverrides[override.entity_id] = existing;
    }
  }
  return { ...user, feature_denies: featureDenies, project_overrides: projectOverrides };
}

function subjectOf(row: Row): RbacSubject {
  return {
    id: asString(row.id),
    portal_user_id: row.portal_id ? asString(row.portal_id) : null,
    username: asString(row.username),
    name: asString(row.display_name) || asString(row.username),
    role: asString(row.role, 'member'),
    roles: [asString(row.role, 'member')],
    status: asString(row.status) === 'active' ? 'active' : 'suspended',
    managed: Boolean(row.portal_id),
  };
}

async function loadSubject(tenantId: string, subjectId: string): Promise<Row> {
  if (!sql) throw new Error('database unavailable');
  const rows = await db()`
    SELECT id, username, display_name, role, tenant_id, org_id, status, portal_id, portal_permissions
      FROM nexusflow.users
     WHERE id = ${subjectId} AND tenant_id = ${tenantId}
     LIMIT 1
  `;
  if (!rows[0]) throw new Error('not found');
  return rows[0] as Row;
}

async function loadProjects(tenantId: string): Promise<ProjectLike[]> {
  if (!sql) return [];
  const rows = await db()`
    SELECT id, data FROM nexusflow.records
     WHERE kind = 'projects' AND tenant_id = ${tenantId}
     ORDER BY created_at ASC
  `;
  return rows.map((row) => {
    const data = (row.data ?? {}) as Row;
    return {
      id: String(row.id),
      name: asString(data.name) || String(row.id),
      org_id: asString(data.org_id),
      visibility: asString(data.visibility, 'normal'),
      owner_id: asString(data.owner_id),
      member_ids: asArray(data.member_ids),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function projectContext(subject: Row): Promise<ProjectContext> {
  const tenantId = asString(subject.tenant_id);
  const userId = asString(subject.id);
  const orgRows = await db()`
    SELECT id, data FROM nexusflow.records
     WHERE kind = 'orgs' AND tenant_id = ${tenantId}
  `;
  const orgParents = new Map<string, string>();
  for (const row of orgRows) {
    const data = (row.data ?? {}) as Row;
    orgParents.set(String(row.id), asString(data.parent_id));
  }
  const delegationRows = await db()`
    SELECT data FROM nexusflow.records
     WHERE kind = 'role_delegations' AND tenant_id = ${tenantId}
       AND data->>'user_id' = ${userId} AND data->>'status' = 'active'
  `;
  const delegatedOrgs = new Set<string>();
  for (const row of delegationRows) {
    for (const id of asArray((row.data as Row)?.org_ids)) delegatedOrgs.add(id);
  }
  const grantRows = await db()`
    SELECT data FROM nexusflow.records
     WHERE kind = 'visibility_grants' AND tenant_id = ${tenantId}
       AND data->>'user_id' = ${userId} AND coalesce(data->>'status','active') = 'active'
       AND (data->>'expires_at' IS NULL OR (data->>'expires_at')::timestamptz > now())
  `;
  const grants = new Map<string, Set<RbacAction>>();
  for (const row of grantRows) {
    const data = (row.data ?? {}) as Row;
    const projectId = asString(data.project_id);
    if (!projectId) continue;
    const existing = grants.get(projectId) ?? new Set<RbacAction>();
    for (const action of grantActions(data.actions)) existing.add(action);
    grants.set(projectId, existing);
  }
  return {
    subjectId: userId,
    subjectRole: asString(subject.role, 'member'),
    subjectOrgId: subject.org_id ? asString(subject.org_id) : null,
    portalPermissions: subject.portal_id && Array.isArray(subject.portal_permissions)
      ? (subject.portal_permissions as string[])
      : null,
    orgParents,
    delegatedOrgs,
    grants,
  };
}

async function subjectMatrix(tenantId: string, subject: Row): Promise<RbacMatrix> {
  const overrides = await loadOverrides(tenantId, asString(subject.id));
  const projects = await loadProjects(tenantId);
  const ctx = await projectContext(subject);
  const role = asString(subject.role, 'member');
  const gates: RbacGate[] = [];
  for (const feature of NEXUSFLOW_FEATURES) {
    for (const action of featureActions(feature)) {
      gates.push({
        type: 'feature', id: feature.id, action,
        allow: featureGate(role, feature, action, ctx.portalPermissions),
      });
    }
  }
  const project = projectCells(projects, ctx, overrides);
  gates.push(...project.gates);
  return {
    subject: subjectOf(subject),
    baseline_label: `角色 ${role}`,
    cells: [...featureCells(role, ctx.portalPermissions, overrides), ...project.cells],
    gates,
  };
}

function cellFor(params: {
  subject: Row;
  ctx: ProjectContext;
  projects: ProjectLike[];
  overrides: RbacOverride[];
  type: string;
  id: string;
  action: RbacAction;
}): RbacCell {
  if (params.type === 'feature') {
    const feature = NEXUSFLOW_FEATURES.find((item) => item.id === params.id);
    const baseline = feature
      ? featureGate(asString(params.subject.role, 'member'), feature, params.action, params.ctx.portalPermissions)
      : false;
    const own = params.overrides.find(
      (item) => item.entity_type === 'feature' && item.entity_id === params.id && item.action === params.action,
    );
    if (own?.effect === 'deny') {
      return { type: 'feature', id: params.id, action: params.action, allow: false, source: 'deny' };
    }
    return {
      type: 'feature', id: params.id, action: params.action,
      allow: own?.effect === 'allow' || baseline,
      source: own?.effect === 'allow' ? 'allow' : 'role',
    };
  }
  const project = params.projects.find((item) => item.id === params.id);
  if (!project) {
    return { type: 'project', id: params.id, action: params.action, allow: false, source: 'role' };
  }
  const cells = projectCells([project], params.ctx, params.overrides).cells;
  return cells.find((item) => item.id === params.id && item.action === params.action)
    ?? { type: 'project', id: params.id, action: params.action, allow: false, source: 'role' };
}

async function writeAudit(input: {
  tenantId: string;
  actorId: string | null;
  action: string;
  resourceId: string;
  detail: Record<string, unknown>;
}): Promise<void> {
  if (!sql) return;
  await db()`
    INSERT INTO nexusflow.audit (id, actor, tenant_id, action, object_kind, object_id, data)
    VALUES (${crypto.randomUUID()}, ${input.actorId}, ${input.tenantId},
            ${input.action}, 'permission_override', ${input.resourceId},
            ${db().json(input.detail as never)})
  `;
}

async function ensureCanModifyFeature(tenantId: string, subject: Row, effect: RbacEffect | null): Promise<void> {
  if (effect !== 'deny') return;
  const role = asString(subject.role);
  if (!['center_director', 'super_admin'].includes(role)) return;
  const rows = await db()`
    SELECT 1 FROM nexusflow.users
     WHERE tenant_id = ${tenantId} AND id <> ${String(subject.id)}
       AND status = 'active' AND role IN ('center_director', 'super_admin')
     LIMIT 1
  `;
  if (rows.length === 0) throw new Error('cannot revoke the last administrator feature');
}

async function setCell(input: {
  tenantId: string;
  subjectId: string;
  type: string;
  id: string;
  action: RbacAction;
  effect: RbacEffect | null;
  actorId: string | null;
}): Promise<RbacCell> {
  const subject = await loadSubject(input.tenantId, input.subjectId);
  const projects = await loadProjects(input.tenantId);
  const validation = validateTarget(input.type, input.id, input.action, new Set(projects.map((item) => item.id)));
  if (validation) throw new Error(validation === 'action_not_supported' ? 'action not supported' : 'entity not found');
  if (input.type === 'feature' && input.effect === 'allow') {
    throw new Error('feature grant is not supported; change the member role instead');
  }
  await ensureCanModifyFeature(input.tenantId, subject, input.effect);
  const ctx = await projectContext(subject);
  const beforeOverrides = await loadOverrides(input.tenantId, input.subjectId);
  if (input.effect === null) {
    await db()`
      DELETE FROM nexusflow.permission_override
       WHERE tenant_id = ${input.tenantId} AND subject_type = 'user' AND subject_id = ${input.subjectId}
         AND entity_type = ${input.type} AND entity_id = ${input.id} AND action = ${input.action}
    `;
  } else {
    await db()`
      INSERT INTO nexusflow.permission_override
        (tenant_id, subject_type, subject_id, entity_type, entity_id, action, effect, updated_by)
      VALUES (${input.tenantId}, 'user', ${input.subjectId}, ${input.type}, ${input.id},
              ${input.action}, ${input.effect}, ${input.actorId})
      ON CONFLICT (tenant_id, subject_type, subject_id, entity_type, entity_id, action)
      DO UPDATE SET effect = EXCLUDED.effect, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;
  }
  const afterOverrides = await loadOverrides(input.tenantId, input.subjectId);
  const before = cellFor({
    subject, ctx, projects, overrides: beforeOverrides,
    type: input.type, id: input.id, action: input.action,
  });
  const after = cellFor({
    subject, ctx, projects, overrides: afterOverrides,
    type: input.type, id: input.id, action: input.action,
  });
  await writeAudit({
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: input.effect === null ? 'rbac.override.reset' : 'rbac.override.set',
    resourceId: input.subjectId,
    detail: {
      subject_id: input.subjectId, type: input.type, id: input.id, action: input.action,
      effect: input.effect, before, after, via: input.actorId ? 'local' : 'portal',
    },
  });
  return after;
}

async function requireManager(user: User): Promise<void> {
  if (!canManageRole(user.role)) throw new Error('forbidden');
}

export function registerRbac(app: ApiApp): void {
  app.get('/api/v1/rbac/catalog', async (c) => {
    const user = c.get('user');
    await requireManager(user);
    return c.json(buildCatalog(await loadProjects(asString(user.tenant_id))));
  });
  app.get('/api/v1/rbac/subjects', async (c) => {
    const user = c.get('user');
    await requireManager(user);
    const rows = await db()`
      SELECT id, username, display_name, role, tenant_id, org_id, status, portal_id, portal_permissions
        FROM nexusflow.users
       WHERE tenant_id = ${user.tenant_id} AND status <> 'disabled'
       ORDER BY CASE WHEN role IN ('center_director','center_deputy') THEN 0 ELSE 1 END,
                display_name, username
    `;
    return c.json({ items: rows.map((row) => subjectOf(row as Row)) });
  });
  app.get('/api/v1/rbac/matrix', async (c) => {
    const user = c.get('user');
    await requireManager(user);
    const subjectId = String(c.req.query('subject_id') || '');
    if (!subjectId) throw new Error('subject_id required');
    const subject = await loadSubject(asString(user.tenant_id), subjectId);
    return c.json(await subjectMatrix(asString(user.tenant_id), subject));
  });
  app.put('/api/v1/rbac/matrix', async (c) => {
    const user = c.get('user');
    await requireManager(user);
    const body = await c.req.json().catch(() => ({}));
    const cell = await setCell({
      tenantId: asString(user.tenant_id),
      subjectId: String(body.subject_id || ''),
      type: String(body.type || ''),
      id: String(body.id || ''),
      action: actionOf(body.action),
      effect: effectOf(body.effect),
      actorId: user.id,
    });
    return c.json({ cell });
  });
  app.delete('/api/v1/rbac/matrix', async (c) => {
    const user = c.get('user');
    await requireManager(user);
    const subjectId = String(c.req.query('subject_id') || '');
    if (!subjectId) throw new Error('subject_id required');
    await loadSubject(asString(user.tenant_id), subjectId);
    const removed = await db()`
      DELETE FROM nexusflow.permission_override
       WHERE tenant_id = ${user.tenant_id} AND subject_type = 'user' AND subject_id = ${subjectId}
       RETURNING entity_id
    `;
    await writeAudit({
      tenantId: asString(user.tenant_id), actorId: user.id,
      action: 'rbac.override.reset', resourceId: subjectId,
      detail: { subject_id: subjectId, removed: removed.length, scope: 'all', via: 'local' },
    });
    return c.json({ removed: removed.length });
  });

  app.post('/api/v1/rbac/prune', async (c) => {
    const user = c.get('user');
    await requireManager(user);
    const dryRun = c.req.query('dry_run') === 'true';
    const stale = await db()`
      SELECT entity_id FROM nexusflow.permission_override o
       WHERE o.tenant_id = ${user.tenant_id} AND o.entity_type = 'project'
         AND NOT EXISTS (
           SELECT 1 FROM nexusflow.records r
            WHERE r.id = o.entity_id AND r.kind = 'projects'
              AND r.tenant_id = o.tenant_id)
    `;
    if (dryRun) return c.json({ dry_run: true, stale: stale.length, removed: 0 });
    const removed = await db()`
      DELETE FROM nexusflow.permission_override o
       WHERE o.tenant_id = ${user.tenant_id} AND o.entity_type = 'project'
         AND NOT EXISTS (
           SELECT 1 FROM nexusflow.records r
            WHERE r.id = o.entity_id AND r.kind = 'projects'
              AND r.tenant_id = o.tenant_id)
       RETURNING entity_id
    `;
    return c.json({ dry_run: false, stale: stale.length, removed: removed.length });
  });

  // ---- Portal 内部接口 ----
  const internal = (c: { req: { header(name: string): string | undefined; query(name: string): string | undefined } }) => {
    if (!tokenOk(c.req.header('X-Portal-Internal-Token') ?? '')) throw new Error('not found');
    const portalTenantId = String(c.req.query('portal_tenant_id') || '');
    if (!portalTenantId) throw new Error('portal_tenant_id required');
    return portalTenantId;
  };
  const localTenant = async (portalTenantId: string): Promise<string> => {
    const rows = await db()`
      SELECT id FROM nexusflow.tenants WHERE portal_tenant_id = ${portalTenantId} LIMIT 1
    `;
    if (!rows[0]) throw new Error('tenant not linked');
    return String(rows[0].id);
  };
  const localActor = async (portalTenantId: string, portalUserId: string): Promise<string | null> => {
    if (!portalUserId) return null;
    const rows = await db()`
      SELECT id FROM nexusflow.users
       WHERE portal_id = ${portalUserId} AND portal_tenant_id = ${portalTenantId} LIMIT 1
    `;
    return rows[0] ? String(rows[0].id) : null;
  };

  app.get('/api/portal/rbac/v1/catalog', async (c) => {
    const tenantId = await localTenant(internal(c));
    return c.json(buildCatalog(await loadProjects(tenantId)));
  });
  app.get('/api/portal/rbac/v1/subjects', async (c) => {
    const tenantId = await localTenant(internal(c));
    const rows = await db()`
      SELECT id, username, display_name, role, tenant_id, org_id, status, portal_id, portal_permissions
        FROM nexusflow.users
       WHERE tenant_id = ${tenantId} AND status <> 'disabled'
       ORDER BY CASE WHEN role IN ('center_director','center_deputy') THEN 0 ELSE 1 END,
                display_name, username
    `;
    return c.json({ items: rows.map((row) => subjectOf(row as Row)) });
  });
  app.get('/api/portal/rbac/v1/matrix', async (c) => {
    const portalTenantId = internal(c);
    const tenantId = await localTenant(portalTenantId);
    const subjectId = String(c.req.query('subject_id') || '');
    if (!subjectId) throw new Error('subject_id required');
    const subject = await loadSubject(tenantId, subjectId);
    return c.json(await subjectMatrix(tenantId, subject));
  });
  app.put('/api/portal/rbac/v1/matrix', async (c) => {
    const portalTenantId = internal(c);
    const tenantId = await localTenant(portalTenantId);
    const body = await c.req.json().catch(() => ({}));
    const actorId = await localActor(portalTenantId, c.req.header('X-Portal-Actor') ?? '');
    const cell = await setCell({
      tenantId,
      subjectId: String(body.subject_id || ''),
      type: String(body.type || ''),
      id: String(body.id || ''),
      action: actionOf(body.action),
      effect: effectOf(body.effect),
      actorId,
    });
    return c.json({ cell });
  });
  app.delete('/api/portal/rbac/v1/matrix', async (c) => {
    const portalTenantId = internal(c);
    const tenantId = await localTenant(portalTenantId);
    const subjectId = String(c.req.query('subject_id') || '');
    if (!subjectId) throw new Error('subject_id required');
    await loadSubject(tenantId, subjectId);
    const actorId = await localActor(portalTenantId, c.req.header('X-Portal-Actor') ?? '');
    const removed = await db()`
      DELETE FROM nexusflow.permission_override
       WHERE tenant_id = ${tenantId} AND subject_type = 'user' AND subject_id = ${subjectId}
       RETURNING entity_id
    `;
    await writeAudit({
      tenantId, actorId,
      action: 'rbac.override.reset', resourceId: subjectId,
      detail: { subject_id: subjectId, removed: removed.length, scope: 'all', via: 'portal' },
    });
    return c.json({ removed: removed.length });
  });
}
