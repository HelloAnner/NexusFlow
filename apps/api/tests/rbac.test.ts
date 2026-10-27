import { describe, expect, test } from 'bun:test';
import {
  featureCells,
  featureGate,
  grantActions,
  portalGate,
  projectCells,
  validateTarget,
  type ProjectLike,
  type RbacOverride,
} from '../src/rbac_core.ts';

const projects: ProjectLike[] = [
  { id: 'p1', name: 'Alpha', org_id: 'org-1', visibility: 'normal', owner_id: 'u1', member_ids: ['u1'] },
  { id: 'p2', name: 'Beta', org_id: 'org-2', visibility: 'hidden', owner_id: 'u2', member_ids: [] },
];

function ctx(overrides: Partial<Parameters<typeof projectCells>[1]> = {}) {
  return {
    subjectId: 'u1',
    subjectRole: 'member',
    subjectOrgId: 'org-1',
    portalPermissions: ['nexusflow:project:read'],
    orgParents: new Map([['org-1', 'root']]),
    delegatedOrgs: new Set<string>(),
    grants: new Map(),
    ...overrides,
  };
}

function cellsOf(cells: ReturnType<typeof projectCells>['cells'], id: string) {
  return Object.fromEntries(cells.filter((cell) => cell.id === id).map((cell) => [cell.action, cell]));
}

describe('nexusflow rbac', () => {
  test('成员看自己的项目；隐藏项目只靠 grant', () => {
    const { cells } = projectCells(projects, ctx(), []);
    expect(cellsOf(cells, 'p1').view).toMatchObject({ allow: true, source: 'role' });
    expect(cellsOf(cells, 'p2').view).toBeUndefined();
    const granted = projectCells(projects, ctx({ grants: new Map([['p2', new Set(['view']) as Set<'view'>]]) }), []);
    expect(cellsOf(granted.cells, 'p2').view).toMatchObject({ allow: true, source: 'role' });
  });

  test('个人 deny / allow 覆盖项目基线', () => {
    const overrides: RbacOverride[] = [
      { entity_type: 'project', entity_id: 'p1', action: 'edit', effect: 'deny' },
      { entity_type: 'project', entity_id: 'p2', action: 'view', effect: 'allow' },
    ];
    const { cells } = projectCells(projects, ctx(), overrides);
    expect(cellsOf(cells, 'p1').edit).toMatchObject({ allow: false, source: 'deny' });
    expect(cellsOf(cells, 'p2').view).toMatchObject({ allow: true, source: 'allow' });
  });

  test('Portal 票据是项目写操作的闸门', () => {
    expect(portalGate(['nexusflow:project:read'], 'view')).toBe(true);
    expect(portalGate(['nexusflow:project:read'], 'edit')).toBe(false);
    expect(portalGate(null, 'edit')).toBe(true);
    const { gates, cells } = projectCells(projects, ctx(), []);
    expect(gates.find((gate) => gate.action === 'edit')?.allow).toBe(false);
    expect(cellsOf(cells, 'p1').edit).toBeUndefined();
  });

  test('功能 deny 关闭功能与项目闸门', () => {
    const overrides: RbacOverride[] = [
      { entity_type: 'feature', entity_id: 'project', action: 'edit', effect: 'deny' },
      { entity_type: 'feature', entity_id: 'people', action: 'manage', effect: 'deny' },
    ];
    const cells = featureCells('center_director', null, overrides);
    expect(cells.find((cell) => cell.id === 'project' && cell.action === 'edit')).toMatchObject({ allow: false, source: 'deny' });
    expect(cells.find((cell) => cell.id === 'people' && cell.action === 'manage')).toMatchObject({ allow: false, source: 'deny' });
  });

  test('迁移映射与实体校验', () => {
    expect([...grantActions(['view', 'dispatch'])]).toEqual(['view', 'manage']);
    expect(validateTarget('project', 'p1', 'view', new Set(['p1']))).toBeNull();
    expect(validateTarget('project', 'nope', 'view', new Set(['p1']))).toBe('unknown_entity');
    expect(validateTarget('feature', 'report', 'manage', new Set())).toBe('action_not_supported');
    expect(featureGate('member', { id: 'dispatch', label: '', actions: ['manage'] }, 'manage', null)).toBe(false);
  });
});
