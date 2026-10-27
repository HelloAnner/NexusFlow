// NexusFlow RBAC 纯计算层。资源实体是项目；功能实体是组织/人员/项目/派发/
// 审批/报表/配置/审计。动作固定 view/edit/manage。

export const RBAC_ACTIONS = [
  { key: 'view', label: '查看' },
  { key: 'edit', label: '编辑' },
  { key: 'manage', label: '管理' },
] as const;

export type RbacAction = (typeof RBAC_ACTIONS)[number]['key'];
export type RbacEffect = 'allow' | 'deny';
export type RbacSource = 'role' | 'allow' | 'deny';

export interface FeatureSpec {
  id: string;
  label: string;
  actions: RbacAction[];
}

export interface RbacOverride {
  entity_type: string;
  entity_id: string;
  action: RbacAction;
  effect: RbacEffect;
}

export interface RbacCell {
  type: string;
  id: string;
  action: RbacAction;
  allow: boolean;
  source: RbacSource;
}

export interface RbacGate {
  type: string;
  id?: string;
  action: RbacAction;
  allow: boolean;
}

export interface RbacEntity {
  type: string;
  id: string;
  label: string;
  actions: RbacAction[];
  parent_id?: string;
}

export interface RbacSubject {
  id: string;
  portal_user_id: string | null;
  username: string;
  name: string;
  role: string;
  roles: string[];
  status: string;
  managed: boolean;
}

export interface RbacMatrix {
  subject: RbacSubject;
  baseline_label: string;
  cells: RbacCell[];
  gates: RbacGate[];
}

export interface ProjectLike {
  id: string;
  name: string;
  org_id: string;
  visibility: string;
  owner_id: string;
  member_ids: string[];
}

export const NEXUSFLOW_FEATURES: FeatureSpec[] = [
  { id: 'org', label: '组织管理', actions: ['manage'] },
  { id: 'people', label: '人员管理', actions: ['manage'] },
  { id: 'project', label: '项目能力', actions: ['view', 'edit', 'manage'] },
  { id: 'dispatch', label: '派发', actions: ['manage'] },
  { id: 'approval', label: '审批', actions: ['manage'] },
  { id: 'report', label: '报表', actions: ['view'] },
  { id: 'config', label: '系统配置', actions: ['manage'] },
  { id: 'audit', label: '审计日志', actions: ['view'] },
];

const FEATURE_BY_ID = new Map(NEXUSFLOW_FEATURES.map((feature) => [feature.id, feature]));

const MANAGERS = new Set([
  'super_admin', 'center_director', 'center_deputy',
  'department_director', 'department_deputy',
]);

export function canManageRole(role: string): boolean {
  return MANAGERS.has(role);
}

export function featureActions(feature: FeatureSpec): RbacAction[] {
  return [...feature.actions];
}

export function overrideMap(overrides: RbacOverride[]): Map<string, RbacEffect> {
  const map = new Map<string, RbacEffect>();
  for (const override of overrides) {
    map.set(`${override.entity_type}\u0000${override.entity_id}\u0000${override.action}`, override.effect);
  }
  return map;
}

/** Portal 票据是项目资源的上层闸门；本地登录没有票据，全部放行。 */
export function portalGate(portalPermissions: string[] | null | undefined, action: RbacAction): boolean {
  if (portalPermissions === null || portalPermissions === undefined) return true;
  const scope = (name: string) => portalPermissions.includes(name) || portalPermissions.includes('nexusflow:admin');
  if (action === 'view') return scope('nexusflow:project:read');
  if (action === 'edit') return scope('nexusflow:project:write');
  return scope('nexusflow:dispatch:write') || scope('nexusflow:project:write');
}

export function featureGate(
  role: string,
  feature: FeatureSpec,
  action: RbacAction,
  portalPermissions: string[] | null | undefined,
): boolean {
  const manage = canManageRole(role);
  const local = (() => {
    switch (feature.id) {
      case 'org':
      case 'people':
      case 'config':
      case 'audit':
        return manage;
      case 'project':
        // 成员在项目内的查看/编辑由项目实体控制；功能层默认开放。
        return true;
      case 'dispatch':
        return manage || role === 'project_lead';
      case 'approval':
        return manage;
      case 'report':
        return true;
      default:
        return false;
    }
  })();
  if (!local) return false;
  if (portalPermissions === null || portalPermissions === undefined) return true;
  const scope = (name: string) => portalPermissions.includes(name) || portalPermissions.includes('nexusflow:admin');
  switch (feature.id) {
    case 'org':
    case 'people':
    case 'config':
    case 'audit':
      return scope('nexusflow:admin');
    case 'dispatch':
      return scope('nexusflow:dispatch:write') || scope('nexusflow:admin');
    case 'approval':
      return scope('nexusflow:approval:write') || scope('nexusflow:admin');
    case 'report':
      return scope('nexusflow:report:read') || scope('nexusflow:admin');
    case 'project':
      if (action === 'view') return scope('nexusflow:project:read');
      return scope('nexusflow:project:write') || scope('nexusflow:admin');
    default:
      return true;
  }
}

export function featureCells(
  role: string,
  portalPermissions: string[] | null | undefined,
  overrides: RbacOverride[],
): RbacCell[] {
  const map = overrideMap(overrides);
  const cells: RbacCell[] = [];
  for (const feature of NEXUSFLOW_FEATURES) {
    for (const action of feature.actions) {
      const baseline = featureGate(role, feature, action, portalPermissions);
      const own = map.get(`feature\u0000${feature.id}\u0000${action}`);
      if (own === 'deny') {
        cells.push({ type: 'feature', id: feature.id, action, allow: false, source: 'deny' });
      } else if (own === 'allow' || baseline) {
        cells.push({
          type: 'feature', id: feature.id, action,
          allow: own === 'allow' || baseline,
          source: own === 'allow' ? 'allow' : 'role',
        });
      }
    }
  }
  return cells;
}

export interface ProjectContext {
  subjectId: string;
  subjectRole: string;
  subjectOrgId: string | null;
  portalPermissions: string[] | null | undefined;
  orgParents: Map<string, string>;
  delegatedOrgs: Set<string>;
  grants: Map<string, Set<RbacAction>>;
}

function orgWithin(ctx: ProjectContext, orgId: string): boolean {
  if (['super_admin', 'center_director'].includes(ctx.subjectRole)) return true;
  if (!orgId) return false;
  const roots: string[] = [];
  if (ctx.subjectRole === 'department_deputy') {
    if (ctx.subjectOrgId) roots.push(ctx.subjectOrgId);
    for (const id of ctx.delegatedOrgs) roots.push(id);
  } else if (['center_deputy'].includes(ctx.subjectRole)) {
    for (const id of ctx.delegatedOrgs) roots.push(id);
  } else if (ctx.subjectOrgId) {
    roots.push(ctx.subjectOrgId);
  }
  if (roots.length === 0) return false;
  if (roots.includes(orgId)) return true;
  let current = orgId;
  for (let depth = 0; depth < 64 && current; depth += 1) {
    current = ctx.orgParents.get(current) ?? '';
    if (roots.includes(current)) return true;
  }
  return false;
}

function projectBaseline(project: ProjectLike, action: RbacAction, ctx: ProjectContext): boolean {
  const member = project.owner_id === ctx.subjectId || project.member_ids.includes(ctx.subjectId);
  const restricted = project.visibility === 'hidden' || project.visibility === 'restricted';
  if (['super_admin', 'center_director'].includes(ctx.subjectRole)) return true;
  if (restricted && !member) return ctx.grants.get(project.id)?.has(action) ?? false;
  if (member) return true;
  return canManageRole(ctx.subjectRole) && orgWithin(ctx, project.org_id);
}

export function projectCells(projects: ProjectLike[], ctx: ProjectContext, overrides: RbacOverride[]): {
  cells: RbacCell[];
  gates: RbacGate[];
} {
  const map = overrideMap(overrides);
  const featureDeny = (action: RbacAction) => overrides.some(
    (item) => item.entity_type === 'feature' && item.entity_id === 'project'
      && item.action === action && item.effect === 'deny',
  );
  const gates: RbacGate[] = (['view', 'edit', 'manage'] as RbacAction[]).map((action) => ({
    type: 'project', action,
    allow: portalGate(ctx.portalPermissions, action) && !featureDeny(action),
  }));
  const cells: RbacCell[] = [];
  for (const project of projects) {
    for (const action of ['view', 'edit', 'manage'] as RbacAction[]) {
      const own = map.get(`project\u0000${project.id}\u0000${action}`);
      if (own === 'deny') {
        cells.push({ type: 'project', id: project.id, action, allow: false, source: 'deny' });
        continue;
      }
      const baseline = portalGate(ctx.portalPermissions, action)
        && !featureDeny(action) && projectBaseline(project, action, ctx);
      if (own === 'allow' || baseline) {
        cells.push({
          type: 'project', id: project.id, action,
          allow: own === 'allow' || baseline,
          source: own === 'allow' ? 'allow' : 'role',
        });
      }
    }
  }
  return { cells, gates };
}

export function buildCatalog(projects: ProjectLike[]): {
  system: string;
  actions: { key: RbacAction; label: string }[];
  entities: RbacEntity[];
} {
  return {
    system: 'nexusflow',
    actions: RBAC_ACTIONS.map((action) => ({ key: action.key, label: action.label })),
    entities: [
      ...NEXUSFLOW_FEATURES.map((feature) => ({
        type: 'feature', id: feature.id, label: feature.label, actions: feature.actions,
      })),
      ...projects.map((project) => ({
        type: 'project', id: project.id, label: project.name, actions: ['view', 'edit', 'manage'] as RbacAction[],
      })),
    ],
  };
}

export function validateTarget(
  type: string,
  id: string,
  action: string,
  projectIds: ReadonlySet<string>,
): string | null {
  if (type === 'feature') {
    const feature = FEATURE_BY_ID.get(id);
    if (!feature) return 'unknown_entity';
    if (!feature.actions.includes(action as RbacAction)) return 'action_not_supported';
    return null;
  }
  if (type === 'project') {
    if (!projectIds.has(id)) return 'unknown_entity';
    if (!['view', 'edit', 'manage'].includes(action)) return 'action_not_supported';
    return null;
  }
  return 'unknown_entity_type';
}

/** 把 visibility_grants 的 actions 收敛成 view/edit/manage。 */
export function grantActions(value: unknown): Set<RbacAction> {
  const out = new Set<RbacAction>();
  if (!Array.isArray(value)) return out;
  for (const action of value) {
    if (action === 'view' || action === 'edit') out.add(action);
    if (action === 'dispatch') out.add('manage');
  }
  return out;
}
