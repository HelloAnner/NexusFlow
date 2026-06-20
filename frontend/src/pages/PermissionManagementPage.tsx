import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, Panel, Select, Table, Tabs, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiFetch, apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiOrg, type ApiPerson, type ApiProject, formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { AlertTriangle, Eye, History, KeyRound, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

interface Role {
  id: string
  code: string
  name: string
  role_type?: string
  enabled?: boolean
  priority?: number
}

interface RoleActions {
  role_id: string
  actions: string[]
}

interface DataScopeRule {
  id: string
  role_id: string
  role_code?: string
  role_name?: string
  scope_type?: string
  org_ids?: string[]
  project_scope_type?: string
  project_ids?: string[]
}

interface VisibilityGrant {
  id: string
  object_type?: string
  object_id?: string
  subject_type?: string
  subject_id?: string
  grant_actions?: string[]
  expires_at?: string | null
  created_at?: string
}

interface AuditLog {
  id: string
  object_type?: string
  object_id?: string
  action?: string
  reason?: string
  before_payload?: unknown
  after_payload?: unknown
  created_at?: string
}

const actionGroups = [
  { module: 'task', label: '任务', actions: ['task.create', 'task.dispatch', 'task.approve', 'task.accept'] },
  { module: 'project', label: '项目', actions: ['project.create', 'project.manage', 'project.manage_member'] },
  { module: 'person', label: '人员组织', actions: ['person.manage', 'org.manage'] },
  { module: 'resource', label: '资料', actions: ['resource.upload', 'resource.download'] },
  { module: 'config', label: '配置', actions: ['config.publish'] },
  { module: 'report', label: '报表', actions: ['report.export'] },
  { module: 'admin', label: '后台', actions: ['admin.manage', 'admin.invitation_manage'] },
]

const highRiskActions = new Set([
  'admin.manage',
  'config.publish',
  'person.manage',
  'org.manage',
  'project.manage',
  'resource.download',
  'report.export',
])

const scopeOptions = [
  { value: 'self', label: '仅本人' },
  { value: 'department', label: '本部门' },
  { value: 'managed_departments', label: '管理部门' },
  { value: 'center', label: '中心全部' },
  { value: 'custom', label: '自定义组织' },
]

const projectScopeOptions = [
  { value: 'member', label: '参与项目' },
  { value: 'managed', label: '负责项目' },
  { value: 'all_visible', label: '全部可见项目' },
  { value: 'custom', label: '自定义项目' },
]

const objectTypes = [
  { value: 'project', label: '项目' },
  { value: 'task', label: '任务' },
  { value: 'resource', label: '资料' },
]

const subjectTypes = [
  { value: 'person', label: '人员' },
  { value: 'role', label: '角色' },
  { value: 'org', label: '组织' },
]

async function loadPermissionData() {
  const [roles, scopes, grants, audits, orgs, projects, people] = await Promise.all([
    apiGet<ApiList<Role>>('/roles', { page_size: 200 }),
    apiGet<ApiList<DataScopeRule>>('/data-scope-rules', { page_size: 200 }),
    apiGet<ApiList<VisibilityGrant>>('/visibility-grants', { page_size: 200 }),
    apiGet<ApiList<AuditLog>>('/audit/permission', { page_size: 80 }),
    apiGet<ApiList<ApiOrg>>('/orgs/tree'),
    apiGet<ApiList<ApiProject>>('/projects', { page_size: 200 }),
    apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }),
  ])
  return {
    roles: roles.items,
    scopes: scopes.items,
    grants: grants.items,
    audits: audits.items,
    orgs: orgs.items,
    projects: projects.items,
    people: people.items,
  }
}

function splitIds(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function joinIds(value?: string[]) {
  return value?.join(', ') ?? ''
}

function labelById(items: { id: string; name?: string; code?: string }[], id?: string) {
  const item = items.find((entry) => entry.id === id)
  return item?.name ?? item?.code ?? id ?? '-'
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function formatJson(value: unknown) {
  if (!value || (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0)) return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function tagVariantForAudit(action?: string) {
  if (!action) return 'info'
  if (action.includes('deleted')) return 'error'
  if (action.includes('updated')) return 'warning'
  return 'info'
}

export function PermissionManagementPage() {
  const { data, loading, error, reload } = useApiData(loadPermissionData, [])
  const roles = useMemo(() => data?.roles ?? [], [data?.roles])
  const [activeTab, setActiveTab] = useState('actions')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [roleActions, setRoleActions] = useState<string[]>([])
  const [initialRoleActions, setInitialRoleActions] = useState<string[]>([])
  const [actionLoadedFor, setActionLoadedFor] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [auditQuery, setAuditQuery] = useState('')
  const [selectedAuditId, setSelectedAuditId] = useState('')
  const [scopeForm, setScopeForm] = useState({
    role_id: '',
    scope_type: 'self',
    org_ids: '',
    project_scope_type: 'member',
    project_ids: '',
    reason: '',
  })
  const [grantForm, setGrantForm] = useState({
    object_type: 'project',
    object_id: '',
    subject_type: 'person',
    subject_id: '',
    grant_actions: 'view',
    expires_at: '',
    reason: '',
  })
  const [message, setMessage] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const roleOptions = useMemo(
    () => [{ value: '', label: '选择角色' }, ...roles.map((role) => ({ value: role.id, label: `${role.name} (${role.code})` }))],
    [roles]
  )

  const selectedRole = roles.find((role) => role.id === selectedRoleId)

  const roleScopeCount = useMemo(
    () => (data?.scopes ?? []).filter((scope) => scope.role_id === selectedRoleId).length,
    [data?.scopes, selectedRoleId]
  )

  const roleGrantCount = useMemo(
    () => (data?.grants ?? []).filter((grant) => grant.subject_type === 'role' && grant.subject_id === selectedRoleId).length,
    [data?.grants, selectedRoleId]
  )

  const roleAuditLogs = useMemo(
    () => (data?.audits ?? []).filter((audit) => audit.object_type === 'role' && audit.object_id === selectedRoleId),
    [data?.audits, selectedRoleId]
  )

  const latestRoleAudit = roleAuditLogs[0]

  const actionImpact = useMemo(() => {
    const added = uniqueSorted(roleActions.filter((action) => !initialRoleActions.includes(action)))
    const removed = uniqueSorted(initialRoleActions.filter((action) => !roleActions.includes(action)))
    const unchanged = uniqueSorted(roleActions.filter((action) => initialRoleActions.includes(action)))
    const highRiskChanged = uniqueSorted([...added, ...removed].filter((action) => highRiskActions.has(action)))
    return { added, removed, unchanged, highRiskChanged }
  }, [initialRoleActions, roleActions])

  const filteredAudits = useMemo(() => {
    const q = auditQuery.trim().toLowerCase()
    const audits = data?.audits ?? []
    if (!q) return audits
    return audits.filter((audit) => [
      audit.action,
      audit.object_type,
      audit.object_id,
      audit.reason,
      formatJson(audit.before_payload),
      formatJson(audit.after_payload),
    ].some((value) => String(value ?? '').toLowerCase().includes(q)))
  }, [auditQuery, data?.audits])

  const selectedAudit = filteredAudits.find((audit) => audit.id === selectedAuditId) ?? filteredAudits[0]

  async function perform(label: string, action: () => Promise<unknown>) {
    setActing(label)
    setMessage(null)
    try {
      await action()
      setMessage(`${label}完成`)
      await reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label}失败`)
    } finally {
      setActing(null)
    }
  }

  async function loadRoleActions(roleId: string) {
    setSelectedRoleId(roleId)
    if (!roleId) {
      setRoleActions([])
      setInitialRoleActions([])
      setActionLoadedFor('')
      setActionReason('')
      return
    }
    const res = await apiGet<RoleActions>(`/roles/${roleId}/actions`)
    const actions = uniqueSorted(res.actions)
    setRoleActions(actions)
    setInitialRoleActions(actions)
    setActionLoadedFor(roleId)
    setActionReason('')
  }

  function toggleAction(action: string) {
    setRoleActions((current) => current.includes(action) ? current.filter((item) => item !== action) : current.concat(action))
  }

  function saveRoleActions() {
    if (!selectedRoleId) return
    if (actionImpact.highRiskChanged.length > 0 && !actionReason.trim()) {
      setMessage('高风险权限变更必须填写变更原因')
      return
    }
    void perform('保存角色动作', async () => {
      await apiFetch(`/roles/${selectedRoleId}/actions`, {
        method: 'PUT',
        body: JSON.stringify({
          actions: roleActions,
          reason: actionReason.trim(),
          impact: actionImpact,
        }),
      })
      setInitialRoleActions(uniqueSorted(roleActions))
      setActionReason('')
    })
  }

  function saveDataScope(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scopeForm.role_id) {
      setMessage('请选择角色')
      return
    }
    void perform('保存数据范围', () => apiPost('/data-scope-rules', {
      role_id: scopeForm.role_id,
      scope_type: scopeForm.scope_type,
      org_ids: splitIds(scopeForm.org_ids),
      project_scope_type: scopeForm.project_scope_type,
      project_ids: splitIds(scopeForm.project_ids),
      reason: scopeForm.reason,
    }))
  }

  function saveVisibilityGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!grantForm.object_id || !grantForm.subject_id) {
      setMessage('请选择授权对象和授权主体')
      return
    }
    void perform('保存隐藏授权', () => apiPost('/visibility-grants', {
      object_type: grantForm.object_type,
      object_id: grantForm.object_id,
      subject_type: grantForm.subject_type,
      subject_id: grantForm.subject_id,
      grant_actions: splitIds(grantForm.grant_actions),
      expires_at: grantForm.expires_at ? new Date(grantForm.expires_at).toISOString() : undefined,
      reason: grantForm.reason,
    }))
  }

  function deleteScope(id: string) {
    void perform('删除数据范围', () => apiFetch(`/data-scope-rules/${id}`, { method: 'DELETE' }))
  }

  function deleteGrant(id: string) {
    void perform('删除隐藏授权', () => apiFetch(`/visibility-grants/${id}`, { method: 'DELETE' }))
  }

  function subjectOptions() {
    if (grantForm.subject_type === 'role') return roleOptions
    if (grantForm.subject_type === 'org') return [{ value: '', label: '选择组织' }, ...(data?.orgs ?? []).map((org) => ({ value: org.id, label: org.name }))]
    return [{ value: '', label: '选择人员' }, ...(data?.people ?? []).map((person) => ({ value: person.id, label: person.name }))]
  }

  return (
    <MainLayout title="权限管理" subtitle="角色动作、数据范围、隐藏授权和权限审计">
      <div className="flex flex-col gap-5">
        {(error || message) && (
          <div className={`rounded-md px-4 py-3 text-sm ${error || message?.includes('失败') ? 'bg-color-error-bg text-color-error' : 'bg-color-success-bg text-color-success'}`}>
            {error || message}
          </div>
        )}

        <div className="flex items-center justify-between">
          <Tabs
            tabs={[
              { value: 'actions', label: '角色动作' },
              { value: 'scopes', label: '数据范围' },
              { value: 'visibility', label: '隐藏授权' },
              { value: 'audit', label: '审计日志' },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
          <span className="text-sm text-text-muted">{loading ? '加载中...' : `${roles.length} 个角色`}</span>
        </div>

        {activeTab === 'actions' && (
          <div className="grid grid-cols-[300px_1fr_300px] gap-5">
            <Panel title="角色详情" right={<KeyRound className="h-5 w-5 text-text-muted" />}>
              <div className="flex flex-col gap-4">
                <Select
                  label="角色"
                  value={selectedRoleId}
                  onChange={(event) => void loadRoleActions(event.target.value)}
                  options={roleOptions}
                />
                {selectedRole ? (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-md border border-border-subtle bg-bg-tertiary p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-text-primary">{selectedRole.name}</div>
                          <div className="mt-1 font-mono text-xs text-text-muted">{selectedRole.code}</div>
                        </div>
                        <Tag variant={selectedRole.enabled === false ? 'error' : 'success'}>
                          {selectedRole.enabled === false ? '停用' : '启用'}
                        </Tag>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge>{selectedRole.role_type ?? 'employee'}</Badge>
                        <Badge>优先级 {selectedRole.priority ?? '-'}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['当前动作', roleActions.length],
                        ['数据范围', roleScopeCount],
                        ['隐藏授权', roleGrantCount],
                        ['最近审计', latestRoleAudit ? formatDateTime(latestRoleAudit.created_at) : '-'],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-md bg-bg-tertiary p-3">
                          <div className="text-xs text-text-muted">{label}</div>
                          <div className="mt-1 text-sm font-semibold text-text-primary">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-md border border-border-subtle p-3 text-sm text-text-muted">
                      权限变更即时生效；已登录用户的菜单和入口可能需要重新进入页面后刷新。
                    </div>
                  </div>
                ) : (
                  <EmptyState title="选择角色" desc="选择角色后查看动作、数据范围和审计摘要。" />
                )}
              </div>
            </Panel>

            <Panel title="角色动作矩阵" right={<ShieldCheck className="h-5 w-5 text-text-muted" />}>
              <div className="grid grid-cols-2 gap-4">
                {actionGroups.map((group) => (
                  <div key={group.module} className="rounded-md border border-border-subtle p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-text-primary">{group.label}</div>
                      <Badge>{group.actions.filter((action) => roleActions.includes(action)).length}/{group.actions.length}</Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      {group.actions.map((action) => {
                        const checked = roleActions.includes(action)
                        const changed = checked !== initialRoleActions.includes(action)
                        const highRisk = highRiskActions.has(action)
                        return (
                          <label key={action} className={`flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-sm transition-fast ${changed ? 'bg-color-warning-bg text-text-primary' : 'text-text-secondary hover:bg-hover-bg'}`}>
                            <span className="flex items-center gap-2">
                              <input type="checkbox" checked={checked} disabled={!selectedRoleId} onChange={() => toggleAction(action)} />
                              <span className="font-mono text-xs">{action}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              {highRisk && <Tag variant="warning">高风险</Tag>}
                              {changed && <Badge>{checked ? '新增' : '移除'}</Badge>}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="发布影响" right={<History className="h-5 w-5 text-text-muted" />}>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['新增动作', actionImpact.added.length],
                    ['移除动作', actionImpact.removed.length],
                    ['高风险', actionImpact.highRiskChanged.length],
                    ['未变化', actionImpact.unchanged.length],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-md bg-bg-tertiary p-3">
                      <div className="text-xs text-text-muted">{label}</div>
                      <div className="mt-1 text-xl font-bold text-text-primary">{value}</div>
                    </div>
                  ))}
                </div>

                {actionImpact.highRiskChanged.length > 0 && (
                  <div className="rounded-md border border-color-warning bg-color-warning-bg p-3 text-sm text-color-warning">
                    <div className="mb-2 flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" />高风险动作变更
                    </div>
                    <div className="font-mono text-xs leading-5">{actionImpact.highRiskChanged.join(', ')}</div>
                  </div>
                )}

                <Input
                  label={actionImpact.highRiskChanged.length > 0 ? '变更原因（必填）' : '变更原因'}
                  placeholder="说明授权或收回权限的业务原因"
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                />

                <div className="rounded-md bg-bg-tertiary p-3">
                  <div className="mb-2 text-xs font-semibold text-text-muted">差异预览</div>
                  <div className="flex flex-col gap-2 text-xs text-text-secondary">
                    <div><span className="text-color-success">新增：</span>{actionImpact.added.join(', ') || '-'}</div>
                    <div><span className="text-color-error">移除：</span>{actionImpact.removed.join(', ') || '-'}</div>
                  </div>
                </div>

                <Button
                  type="button"
                  disabled={
                    !selectedRoleId
                    || acting !== null
                    || actionLoadedFor !== selectedRoleId
                    || (actionImpact.added.length === 0 && actionImpact.removed.length === 0)
                    || (actionImpact.highRiskChanged.length > 0 && !actionReason.trim())
                  }
                  onClick={saveRoleActions}
                >
                  <Save className="h-4 w-4" />发布权限变更
                </Button>
              </div>
            </Panel>
          </div>
        )}

        {activeTab === 'scopes' && (
          <div className="grid grid-cols-[360px_1fr] gap-5">
            <Panel title="新增数据范围">
              <form onSubmit={saveDataScope} className="flex flex-col gap-4">
                <Select label="角色" value={scopeForm.role_id} onChange={(event) => setScopeForm((prev) => ({ ...prev, role_id: event.target.value }))} options={roleOptions} />
                <Select label="组织范围" value={scopeForm.scope_type} onChange={(event) => setScopeForm((prev) => ({ ...prev, scope_type: event.target.value }))} options={scopeOptions} />
                <Input label="自定义组织 ID" placeholder="多个 ID 用英文逗号分隔" value={scopeForm.org_ids} onChange={(event) => setScopeForm((prev) => ({ ...prev, org_ids: event.target.value }))} />
                <Select label="项目范围" value={scopeForm.project_scope_type} onChange={(event) => setScopeForm((prev) => ({ ...prev, project_scope_type: event.target.value }))} options={projectScopeOptions} />
                <Input label="自定义项目 ID" placeholder="多个 ID 用英文逗号分隔" value={scopeForm.project_ids} onChange={(event) => setScopeForm((prev) => ({ ...prev, project_ids: event.target.value }))} />
                <Input label="审计备注" value={scopeForm.reason} onChange={(event) => setScopeForm((prev) => ({ ...prev, reason: event.target.value }))} />
                <Button disabled={acting !== null}>保存数据范围</Button>
              </form>
            </Panel>
            <Panel title="已有数据范围">
              <Table>
                <Thead><Tr><Th>角色</Th><Th>组织范围</Th><Th>组织 ID</Th><Th>项目范围</Th><Th>项目 ID</Th><Th>操作</Th></Tr></Thead>
                <Tbody>
                  {(data?.scopes ?? []).map((scope) => (
                    <Tr key={scope.id}>
                      <Td>{scope.role_name ?? labelById(roles, scope.role_id)}</Td>
                      <Td><Badge>{scope.scope_type}</Badge></Td>
                      <Td className="max-w-[220px] truncate">{joinIds(scope.org_ids) || '-'}</Td>
                      <Td><Badge>{scope.project_scope_type}</Badge></Td>
                      <Td className="max-w-[220px] truncate">{joinIds(scope.project_ids) || '-'}</Td>
                      <Td><Button type="button" variant="ghost" className="h-8 px-2 py-0 text-sm" onClick={() => deleteScope(scope.id)}><Trash2 className="h-4 w-4" /></Button></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {!loading && (data?.scopes ?? []).length === 0 && <EmptyState title="暂无数据范围" desc="为角色添加数据范围后会显示在这里。" />}
            </Panel>
          </div>
        )}

        {activeTab === 'visibility' && (
          <div className="grid grid-cols-[360px_1fr] gap-5">
            <Panel title="新增隐藏授权">
              <form onSubmit={saveVisibilityGrant} className="flex flex-col gap-4">
                <Select label="对象类型" value={grantForm.object_type} onChange={(event) => setGrantForm((prev) => ({ ...prev, object_type: event.target.value, object_id: '' }))} options={objectTypes} />
                <Select
                  label="授权对象"
                  value={grantForm.object_id}
                  onChange={(event) => setGrantForm((prev) => ({ ...prev, object_id: event.target.value }))}
                  options={grantForm.object_type === 'project'
                    ? [{ value: '', label: '选择项目' }, ...(data?.projects ?? []).map((project) => ({ value: project.id, label: project.name }))]
                    : [{ value: '', label: '手动输入对象 ID' }]}
                />
                {grantForm.object_type !== 'project' && <Input label="对象 ID" value={grantForm.object_id} onChange={(event) => setGrantForm((prev) => ({ ...prev, object_id: event.target.value }))} />}
                <Select label="主体类型" value={grantForm.subject_type} onChange={(event) => setGrantForm((prev) => ({ ...prev, subject_type: event.target.value, subject_id: '' }))} options={subjectTypes} />
                <Select label="授权主体" value={grantForm.subject_id} onChange={(event) => setGrantForm((prev) => ({ ...prev, subject_id: event.target.value }))} options={subjectOptions()} />
                <Input label="授权动作" value={grantForm.grant_actions} onChange={(event) => setGrantForm((prev) => ({ ...prev, grant_actions: event.target.value }))} />
                <Input label="过期时间" type="datetime-local" value={grantForm.expires_at} onChange={(event) => setGrantForm((prev) => ({ ...prev, expires_at: event.target.value }))} />
                <Input label="审计备注" value={grantForm.reason} onChange={(event) => setGrantForm((prev) => ({ ...prev, reason: event.target.value }))} />
                <Button disabled={acting !== null}>保存隐藏授权</Button>
              </form>
            </Panel>
            <Panel title="已有隐藏授权">
              <Table>
                <Thead><Tr><Th>对象</Th><Th>主体</Th><Th>动作</Th><Th>过期</Th><Th>创建时间</Th><Th>操作</Th></Tr></Thead>
                <Tbody>
                  {(data?.grants ?? []).map((grant) => (
                    <Tr key={grant.id}>
                      <Td>{grant.object_type}:{grant.object_type === 'project' ? labelById(data?.projects ?? [], grant.object_id) : grant.object_id}</Td>
                      <Td>{grant.subject_type}:{grant.subject_id}</Td>
                      <Td>{grant.grant_actions?.join(', ') || '-'}</Td>
                      <Td>{grant.expires_at ? formatDateTime(grant.expires_at) : '长期'}</Td>
                      <Td>{formatDateTime(grant.created_at)}</Td>
                      <Td><Button type="button" variant="ghost" className="h-8 px-2 py-0 text-sm" onClick={() => deleteGrant(grant.id)}><Trash2 className="h-4 w-4" /></Button></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {!loading && (data?.grants ?? []).length === 0 && <EmptyState title="暂无隐藏授权" desc="隐藏项目或资料授权会显示在这里。" />}
            </Panel>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="grid grid-cols-[1fr_380px] gap-5">
            <Panel
              title="权限审计"
              right={<span className="text-sm text-text-muted">{filteredAudits.length} 条</span>}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <Input
                  className="w-[360px]"
                  placeholder="搜索动作、对象、原因或 payload"
                  value={auditQuery}
                  onChange={(event) => setAuditQuery(event.target.value)}
                />
                <Button type="button" variant="secondary" onClick={() => setAuditQuery('')}>清空</Button>
              </div>
              <Table>
                <Thead><Tr><Th>动作</Th><Th>对象</Th><Th>对象 ID</Th><Th>原因</Th><Th>时间</Th><Th>详情</Th></Tr></Thead>
                <Tbody>
                  {filteredAudits.map((audit) => (
                    <Tr
                      key={audit.id}
                      className={selectedAudit?.id === audit.id ? 'bg-selected-bg' : undefined}
                      onClick={() => setSelectedAuditId(audit.id)}
                    >
                      <Td><Tag variant={tagVariantForAudit(audit.action)}>{audit.action ?? '-'}</Tag></Td>
                      <Td>{audit.object_type ?? '-'}</Td>
                      <Td className="max-w-[180px] truncate font-mono text-xs">{audit.object_id ?? '-'}</Td>
                      <Td className="max-w-[240px] truncate">{audit.reason || '-'}</Td>
                      <Td>{formatDateTime(audit.created_at)}</Td>
                      <Td>
                        <Button type="button" variant="ghost" className="h-8 px-2 py-0 text-sm" onClick={() => setSelectedAuditId(audit.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {!loading && filteredAudits.length === 0 && <EmptyState title="暂无审计日志" desc="当前筛选下没有权限或授权变更。" />}
            </Panel>

            <Panel title="审计详情">
              {selectedAudit ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{selectedAudit.action ?? '-'}</div>
                    <div className="mt-1 font-mono text-xs text-text-muted">{selectedAudit.object_type ?? '-'} / {selectedAudit.object_id ?? '-'}</div>
                  </div>
                  <div className="rounded-md bg-bg-tertiary p-3">
                    <div className="text-xs font-semibold text-text-muted">原因</div>
                    <div className="mt-2 text-sm text-text-secondary">{selectedAudit.reason || '-'}</div>
                  </div>
                  <div className="rounded-md border border-border-subtle">
                    <div className="border-b border-border-subtle px-3 py-2 text-xs font-semibold text-text-muted">Before</div>
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-text-secondary">{formatJson(selectedAudit.before_payload)}</pre>
                  </div>
                  <div className="rounded-md border border-border-subtle">
                    <div className="border-b border-border-subtle px-3 py-2 text-xs font-semibold text-text-muted">After</div>
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-text-secondary">{formatJson(selectedAudit.after_payload)}</pre>
                  </div>
                </div>
              ) : (
                <EmptyState title="选择审计记录" desc="点击左侧记录查看变更前后和原因。" />
              )}
            </Panel>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
