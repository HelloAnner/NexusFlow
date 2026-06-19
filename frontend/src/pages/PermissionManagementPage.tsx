import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, Panel, Select, Table, Tabs, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiFetch, apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiOrg, type ApiPerson, type ApiProject, formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

interface Role {
  id: string
  code: string
  name: string
  role_type?: string
  enabled?: boolean
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

export function PermissionManagementPage() {
  const { data, loading, error, reload } = useApiData(loadPermissionData, [])
  const roles = data?.roles ?? []
  const [activeTab, setActiveTab] = useState('actions')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [roleActions, setRoleActions] = useState<string[]>([])
  const [actionLoadedFor, setActionLoadedFor] = useState('')
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
      setActionLoadedFor('')
      return
    }
    const res = await apiGet<RoleActions>(`/roles/${roleId}/actions`)
    setRoleActions(res.actions)
    setActionLoadedFor(roleId)
  }

  function toggleAction(action: string) {
    setRoleActions((current) => current.includes(action) ? current.filter((item) => item !== action) : current.concat(action))
  }

  function saveRoleActions() {
    if (!selectedRoleId) return
    void perform('保存角色动作', () => apiFetch(`/roles/${selectedRoleId}/actions`, {
      method: 'PUT',
      body: JSON.stringify({ actions: roleActions }),
    }))
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
          <Panel title="角色动作矩阵" right={<ShieldCheck className="h-5 w-5 text-text-muted" />}>
            <div className="flex items-end gap-3">
              <Select
                label="角色"
                className="w-[320px]"
                value={selectedRoleId}
                onChange={(event) => void loadRoleActions(event.target.value)}
                options={roleOptions}
              />
              <Button type="button" className="h-10 px-4 py-0 text-sm" disabled={!selectedRoleId || acting !== null || actionLoadedFor !== selectedRoleId} onClick={saveRoleActions}>
                <Save className="h-4 w-4" />保存
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {actionGroups.map((group) => (
                <div key={group.module} className="rounded-md border border-border-subtle p-4">
                  <div className="mb-3 text-sm font-semibold text-text-primary">{group.label}</div>
                  <div className="flex flex-col gap-2">
                    {group.actions.map((action) => (
                      <label key={action} className="flex items-center gap-2 text-sm text-text-secondary">
                        <input type="checkbox" checked={roleActions.includes(action)} disabled={!selectedRoleId} onChange={() => toggleAction(action)} />
                        <span>{action}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
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
          <Panel title="权限审计">
            <Table>
              <Thead><Tr><Th>动作</Th><Th>对象</Th><Th>对象 ID</Th><Th>原因</Th><Th>时间</Th></Tr></Thead>
              <Tbody>
                {(data?.audits ?? []).map((audit) => (
                  <Tr key={audit.id}>
                    <Td><Tag variant="info">{audit.action ?? '-'}</Tag></Td>
                    <Td>{audit.object_type ?? '-'}</Td>
                    <Td className="font-mono text-xs">{audit.object_id ?? '-'}</Td>
                    <Td>{audit.reason || '-'}</Td>
                    <Td>{formatDateTime(audit.created_at)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {!loading && (data?.audits ?? []).length === 0 && <EmptyState title="暂无审计日志" desc="权限和授权变更会写入审计。" />}
          </Panel>
        )}
      </div>
    </MainLayout>
  )
}
