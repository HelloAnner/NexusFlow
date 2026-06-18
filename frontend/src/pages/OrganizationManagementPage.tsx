/* eslint-disable react-hooks/set-state-in-effect */
import { MainLayout } from '@/components/layout'
import { Avatar, Button, EmptyState, Input, Select, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { type ApiList, type ApiPerson, accountStatusLabel, workStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  GitBranchPlus,
  MoreHorizontal,
  MoveRight,
  Save,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface ApiOrg {
  id: string
  name: string
  code: string
  org_type: string
  parent_id?: string | null
  path?: string
  leader_ids?: string[]
  deputy_leader_ids?: string[]
  technical_supervisor_ids?: string[]
  default_approver_ids?: string[]
  enabled?: boolean
  payload?: Record<string, unknown>
}

interface OrgForm {
  name: string
  code: string
  org_type: string
  parent_id: string
  enabled: string
  leader_ids: string
  deputy_leader_ids: string
  technical_supervisor_ids: string
  default_approver_ids: string
  owner: string
  location: string
  cost_center: string
  description: string
  reason: string
}

const orgTypeOptions = [
  { value: 'company', label: '公司' },
  { value: 'center', label: '中心' },
  { value: 'department', label: '部门' },
  { value: 'studio', label: '工作室' },
]

const emptyCreateForm: OrgForm = {
  name: '',
  code: '',
  org_type: 'department',
  parent_id: '',
  enabled: 'true',
  leader_ids: '',
  deputy_leader_ids: '',
  technical_supervisor_ids: '',
  default_approver_ids: '',
  owner: '',
  location: '',
  cost_center: '',
  description: '',
  reason: '',
}

function orgTypeLabel(type: string) {
  return orgTypeOptions.find((option) => option.value === type)?.label ?? type
}

function depthOf(path?: string) {
  return Math.max(0, (path ?? '').split('/').filter(Boolean).length - 1)
}

function payloadText(org: ApiOrg | null, key: string) {
  const value = org?.payload?.[key]
  return typeof value === 'string' ? value : ''
}

function idsToText(ids?: string[]) {
  return ids?.join(', ') ?? ''
}

function textToIds(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function orgToForm(org: ApiOrg | null): OrgForm {
  if (!org) return emptyCreateForm
  return {
    name: org.name,
    code: org.code,
    org_type: org.org_type,
    parent_id: org.parent_id ?? '',
    enabled: org.enabled === false ? 'false' : 'true',
    leader_ids: idsToText(org.leader_ids),
    deputy_leader_ids: idsToText(org.deputy_leader_ids),
    technical_supervisor_ids: idsToText(org.technical_supervisor_ids),
    default_approver_ids: idsToText(org.default_approver_ids),
    owner: payloadText(org, 'owner'),
    location: payloadText(org, 'location'),
    cost_center: payloadText(org, 'cost_center'),
    description: payloadText(org, 'description'),
    reason: '',
  }
}

function personTagVariant(status?: string) {
  if (status === 'active' || status === 'enabled') return 'success'
  if (status === 'pending' || status === 'business_trip') return 'warning'
  return 'error'
}

export function OrganizationManagementPage() {
  const { data, loading, error, reload } = useApiData(() => apiGet<ApiList<ApiOrg>>('/orgs/tree'), [])
  const orgs = useMemo(() => data?.items ?? [], [data?.items])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => orgs.find((org) => org.id === (selectedId ?? orgs[0]?.id)) ?? null,
    [orgs, selectedId]
  )
  const effectiveSelectedId = selected?.id ?? ''
  const membersState = useApiData(
    () => apiGet<ApiList<ApiPerson>>('/users', { page_size: 80, org_id: effectiveSelectedId }),
    [effectiveSelectedId]
  )
  const members = effectiveSelectedId ? (membersState.data?.items ?? []) : []
  const [form, setForm] = useState<OrgForm>(orgToForm(selected))
  const [createForm, setCreateForm] = useState<OrgForm>(emptyCreateForm)
  const [creating, setCreating] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const enabled = orgs.filter((org) => org.enabled).length
  const maxDepth = orgs.length ? Math.max(...orgs.map((org) => depthOf(org.path))) + 1 : 0

  useEffect(() => {
    setForm(orgToForm(selected))
  }, [selected])

  function updateField(key: keyof OrgForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateCreateField(key: keyof OrgForm, value: string) {
    setCreateForm((current) => ({ ...current, [key]: value }))
  }

  function openCreate(parent: ApiOrg | null, orgType = 'department') {
    setCreateForm({ ...emptyCreateForm, parent_id: parent?.id ?? '', org_type: orgType })
    setCreating(true)
    setMenuId(null)
  }

  async function saveOrg() {
    if (!selected) return
    setSaving('保存组织')
    setMessage(null)
    try {
      await apiPatch(`/orgs/${selected.id}`, {
        name: form.name,
        code: form.code,
        org_type: form.org_type,
        enabled: form.enabled === 'true',
        leader_ids: textToIds(form.leader_ids),
        deputy_leader_ids: textToIds(form.deputy_leader_ids),
        technical_supervisor_ids: textToIds(form.technical_supervisor_ids),
        default_approver_ids: textToIds(form.default_approver_ids),
        owner: form.owner,
        location: form.location,
        cost_center: form.cost_center,
        description: form.description,
        reason: form.reason,
      })
      await reload()
      setMessage('组织字段已保存')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(null)
    }
  }

  async function moveOrg() {
    if (!selected) return
    setSaving('移动组织')
    setMessage(null)
    try {
      await apiPost(`/orgs/${selected.id}/move`, { parent_id: form.parent_id, reason: form.reason })
      await reload()
      setMessage('组织位置已更新')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '移动失败')
    } finally {
      setSaving(null)
    }
  }

  async function createOrg() {
    setSaving('新建组织')
    setMessage(null)
    try {
      const result = await apiPost<{ id: string }>('/orgs', {
        name: createForm.name,
        code: createForm.code,
        org_type: createForm.org_type,
        parent_id: createForm.parent_id,
        leader_ids: textToIds(createForm.leader_ids),
        deputy_leader_ids: textToIds(createForm.deputy_leader_ids),
        technical_supervisor_ids: textToIds(createForm.technical_supervisor_ids),
        default_approver_ids: textToIds(createForm.default_approver_ids),
        owner: createForm.owner,
        location: createForm.location,
        cost_center: createForm.cost_center,
        description: createForm.description,
        reason: createForm.reason,
      })
      setCreating(false)
      setSelectedId(result.id)
      await reload()
      setMessage('新组织已创建')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(null)
    }
  }

  const allOrgOptions = [{ value: '', label: '根组织' }].concat(
    orgs.map((org) => ({
      value: org.id,
      label: `${'　'.repeat(depthOf(org.path))}${org.name}`,
    }))
  )
  const moveOrgOptions = [{ value: '', label: '根组织' }].concat(
    orgs.filter((org) => {
      if (!selected) return true
      return org.id !== selected.id && !org.path?.startsWith(`${selected.path}/`)
    }).map((org) => ({
      value: org.id,
      label: `${'　'.repeat(depthOf(org.path))}${org.name}`,
    }))
  )

  return (
    <MainLayout title="组织管理" subtitle="组织树、部门治理、人员归属和审批关系">
      <div className="flex min-h-[calc(100vh-132px)] flex-col gap-5">
        {(error || message) && (
          <div className={[
            'rounded-md px-4 py-3 text-sm',
            error || message?.includes('失败') || message?.includes('required') ? 'bg-color-error-bg text-color-error' : 'bg-color-success-bg text-color-success',
          ].join(' ')}
          >
            {error ?? message}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <Metric label="组织总数" value={orgs.length} />
          <Metric label="启用组织" value={enabled} />
          <Metric label="组织层级" value={maxDepth} />
          <Metric label="当前成员" value={members.length} />
        </div>

        <div className="grid flex-1 grid-cols-[minmax(360px,430px)_1fr] gap-5">
          <section className="flex min-h-[720px] flex-col rounded-lg border border-border-subtle bg-bg-secondary">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">部门树</h2>
                <p className="mt-1 text-xs text-text-muted">点击节点切换右侧详情；三点菜单执行层级动作。</p>
              </div>
              <Button className="h-9 px-3 py-0 text-sm" onClick={() => openCreate(null, 'company')}>
                <GitBranchPlus className="h-4 w-4" />新建根组织
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {orgs.map((org) => {
                const active = selected?.id === org.id
                const depth = depthOf(org.path)
                return (
                  <div key={org.id} className="relative">
                    <button
                      className={[
                        'group flex w-full items-center gap-2 rounded-md py-2 pr-2 text-left transition-fast',
                        active ? 'bg-hover-bg text-text-primary shadow-sm' : 'text-text-secondary hover:bg-hover-bg',
                      ].join(' ')}
                      style={{ paddingLeft: `${10 + depth * 22}px` }}
                      onClick={() => setSelectedId(org.id)}
                    >
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-placeholder" />
                      <Building2 className="h-4 w-4 shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{org.name}</span>
                      <span className="shrink-0 rounded-sm bg-bg-tertiary px-2 py-0.5 text-xs text-text-muted">{orgTypeLabel(org.org_type)}</span>
                      <span className="shrink-0 text-xs text-text-muted">{org.code}</span>
                    </button>
                    <button
                      className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-bg-primary hover:text-text-primary"
                      aria-label={`${org.name} 操作`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuId(menuId === org.id ? null : org.id)
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === org.id && (
                      <div className="absolute right-2 top-9 z-20 w-40 rounded-md border border-border-subtle bg-bg-primary p-1 shadow-lg">
                        <MenuButton onClick={() => openCreate(org, 'department')}>新建下级部门</MenuButton>
                        <MenuButton onClick={() => openCreate(org, 'studio')}>新建下级小组</MenuButton>
                        <MenuButton onClick={() => { setSelectedId(org.id); setMenuId(null) }}>编辑详情</MenuButton>
                      </div>
                    )}
                  </div>
                )
              })}
              {!loading && orgs.length === 0 && <EmptyState title="暂无组织" desc="从右上角新建根组织开始。" />}
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-5">
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-5">
              {selected ? (
                <div className="flex flex-col gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-semibold text-text-primary">{selected.name}</h2>
                        <Tag variant={selected.enabled ? 'success' : 'error'}>
                          {selected.enabled ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <CircleOff className="mr-1 h-3 w-3" />}
                          {selected.enabled ? '启用' : '停用'}
                        </Tag>
                      </div>
                      <p className="mt-2 font-mono text-xs text-text-muted">{selected.path ?? '-'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="h-10 px-3 py-0 text-sm" onClick={() => openCreate(selected, 'department')}>
                        <GitBranchPlus className="h-4 w-4" />新建下级
                      </Button>
                      <Button className="h-10 px-3 py-0 text-sm" disabled={saving !== null} onClick={() => void saveOrg()}>
                        <Save className="h-4 w-4" />保存字段
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <Input label="组织名称" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
                    <Input label="组织编码" value={form.code} onChange={(event) => updateField('code', event.target.value)} />
                    <Select label="组织类型" value={form.org_type} onChange={(event) => updateField('org_type', event.target.value)} options={orgTypeOptions} />
                    <Select label="启用状态" value={form.enabled} onChange={(event) => updateField('enabled', event.target.value)} options={[
                      { value: 'true', label: '启用' },
                      { value: 'false', label: '停用' },
                    ]} />
                    <Input label="负责人 ID" value={form.leader_ids} onChange={(event) => updateField('leader_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
                    <Input label="副负责人 ID" value={form.deputy_leader_ids} onChange={(event) => updateField('deputy_leader_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
                    <Input label="技术负责人 ID" value={form.technical_supervisor_ids} onChange={(event) => updateField('technical_supervisor_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
                    <Input label="默认审批人 ID" value={form.default_approver_ids} onChange={(event) => updateField('default_approver_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
                    <Input label="业务负责人" value={form.owner} onChange={(event) => updateField('owner', event.target.value)} />
                    <Input label="办公地点" value={form.location} onChange={(event) => updateField('location', event.target.value)} />
                    <Input label="成本中心" value={form.cost_center} onChange={(event) => updateField('cost_center', event.target.value)} />
                    <Input label="审计备注" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} />
                    <label className="col-span-3 flex flex-col gap-2">
                      <span className="text-sm font-medium text-text-muted">组织说明</span>
                      <textarea
                        className="min-h-24 w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary placeholder:text-text-placeholder transition-fast focus:border-text-muted focus:outline-none"
                        value={form.description}
                        onChange={(event) => updateField('description', event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="flex items-end gap-3 rounded-md border border-border-subtle bg-bg-primary p-4">
                    <Select className="flex-1" label="移动到上级组织" value={form.parent_id} onChange={(event) => updateField('parent_id', event.target.value)} options={moveOrgOptions} />
                    <Button variant="secondary" className="h-11 px-4 py-0" disabled={saving !== null} onClick={() => void moveOrg()}>
                      <MoveRight className="h-4 w-4" />移动组织
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState title="未选择组织" desc="从左侧组织树选择一个节点查看和编辑详情。" />
              )}
            </div>

            <div className="rounded-lg border border-border-subtle bg-bg-secondary">
              <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-text-muted" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">关联人员</h3>
                </div>
                <span className="text-sm text-text-muted">{membersState.loading ? '加载中' : `${members.length} 人`}</span>
              </div>
              <Table>
                <Thead>
                  <Tr><Th>人员</Th><Th>工号</Th><Th>组织关系</Th><Th>工时</Th><Th>工作状态</Th><Th>账号状态</Th></Tr>
                </Thead>
                <Tbody>
                  {members.map((person) => (
                    <Tr key={person.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={person.name} />
                          <div>
                            <div className="font-medium text-text-primary">{person.name}</div>
                            <div className="text-xs text-text-muted">{person.id}</div>
                          </div>
                        </div>
                      </Td>
                      <Td>{person.employee_no ?? '-'}</Td>
                      <Td>{person.primary_org_id === selected?.id ? '主组织' : '兼属/关联'}</Td>
                      <Td>{person.daily_standard_hours ?? 8}h</Td>
                      <Td><Tag variant={personTagVariant(person.work_status)}>{workStatusLabel(person.work_status)}</Tag></Td>
                      <Td><Tag variant={personTagVariant(person.account_status)}>{accountStatusLabel(person.account_status)}</Tag></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {!membersState.loading && members.length === 0 && <EmptyState title="暂无关联人员" desc="该组织下还没有主组织或兼属成员。" />}
            </div>
          </section>
        </div>

        {creating && (
          <div className="fixed inset-y-0 right-0 z-30 flex w-[min(680px,96vw)] flex-col border-l border-border-subtle bg-bg-primary shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">新建组织/部门</h2>
                <p className="mt-1 text-sm text-text-muted">从任意层级创建下级，创建后会自动关联到树上。</p>
              </div>
              <button className="rounded-md p-2 text-text-muted hover:bg-hover-bg" onClick={() => setCreating(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <Input label="组织名称" value={createForm.name} onChange={(event) => updateCreateField('name', event.target.value)} />
                <Input label="组织编码" value={createForm.code} onChange={(event) => updateCreateField('code', event.target.value)} />
                <Select label="上级组织" value={createForm.parent_id} onChange={(event) => updateCreateField('parent_id', event.target.value)} options={allOrgOptions} />
                <Select label="组织类型" value={createForm.org_type} onChange={(event) => updateCreateField('org_type', event.target.value)} options={orgTypeOptions} />
                <Input label="负责人 ID" value={createForm.leader_ids} onChange={(event) => updateCreateField('leader_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
                <Input label="默认审批人 ID" value={createForm.default_approver_ids} onChange={(event) => updateCreateField('default_approver_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
                <Input label="业务负责人" value={createForm.owner} onChange={(event) => updateCreateField('owner', event.target.value)} />
                <Input label="成本中心" value={createForm.cost_center} onChange={(event) => updateCreateField('cost_center', event.target.value)} />
                <label className="col-span-2 flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-muted">组织说明</span>
                  <textarea
                    className="min-h-28 w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary transition-fast focus:border-text-muted focus:outline-none"
                    value={createForm.description}
                    onChange={(event) => updateCreateField('description', event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border-subtle px-6 py-4">
              <Button variant="secondary" onClick={() => setCreating(false)}>取消</Button>
              <Button disabled={!createForm.name || !createForm.code || saving !== null} onClick={() => void createOrg()}>
                <GitBranchPlus className="h-4 w-4" />创建
              </Button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary px-5 py-4">
      <div className="text-sm text-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
    </div>
  )
}

function MenuButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm text-text-secondary hover:bg-hover-bg hover:text-text-primary" onClick={onClick}>
      {children}
    </button>
  )
}
