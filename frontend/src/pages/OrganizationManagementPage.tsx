/* eslint-disable react-hooks/set-state-in-effect */
import { MainLayout } from '@/components/layout'
import { Avatar, Badge, Button, EmptyState, Input, Select, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { type ApiList, type ApiOrg, type ApiPerson, accountStatusLabel, workStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Building2, ChevronRight, GitBranchPlus, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface FullApiOrg extends ApiOrg {
  leader_ids?: string[]
  deputy_leader_ids?: string[]
  technical_supervisor_ids?: string[]
  default_approver_ids?: string[]
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

interface ApiRole {
  id: string
  name: string
  code?: string
}

const orgTypeOptions = [
  { value: 'company', label: '公司' },
  { value: 'center', label: '中心' },
  { value: 'department', label: '部门' },
  { value: 'studio', label: '工作室' },
]

const workStatusOptions = [
  { value: 'active', label: '在岗' },
  { value: 'business_trip', label: '出差' },
  { value: 'leave', label: '休假' },
  { value: 'inactive', label: '离岗' },
]

const accountStatusOptions = [
  { value: 'enabled', label: '启用' },
  { value: 'pending', label: '待审核' },
  { value: 'disabled', label: '禁用' },
  { value: 'locked', label: '锁定' },
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

function orgTypeLabel(type?: string) {
  return orgTypeOptions.find((option) => option.value === type)?.label ?? type ?? '-'
}

function depthOf(path?: string | null) {
  return Math.max(0, (path ?? '').split('/').filter(Boolean).length - 1)
}

function payloadText(org: FullApiOrg | null, key: string) {
  const value = org?.payload?.[key]
  return typeof value === 'string' ? value : ''
}

function idsToText(ids?: string[]) {
  return ids?.join(', ') ?? ''
}

function textToIds(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function orgToForm(org: FullApiOrg | null): OrgForm {
  if (!org) return emptyCreateForm
  return {
    name: org.name,
    code: org.code ?? '',
    org_type: org.org_type ?? 'department',
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

function formatOrgBlockers(blockers: Record<string, number> | null | undefined) {
  if (!blockers) return ''
  const parts: string[] = []
  if (blockers.child_count > 0) parts.push(`${blockers.child_count} 个子部门`)
  if (blockers.person_count > 0) parts.push(`${blockers.person_count} 名人员`)
  if (blockers.project_count > 0) parts.push(`${blockers.project_count} 个项目`)
  if (blockers.task_count > 0) parts.push(`${blockers.task_count} 个任务`)
  return parts.join('、')
}

type DrawerMode = 'closed' | 'org' | 'person' | 'create-org' | 'create-person'

export function OrganizationManagementPage() {
  const { data, loading, error, reload } = useApiData(() => apiGet<ApiList<FullApiOrg>>('/orgs/tree'), [])
  const orgs = useMemo(() => data?.items ?? [], [data?.items])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, FullApiOrg[]>()
    orgs.forEach((org) => {
      const key = org.parent_id ?? ''
      map.set(key, [...(map.get(key) ?? []), org])
    })
    return map
  }, [orgs])
  const parentIds = useMemo(() => new Set(orgs.filter((org) => (childrenByParent.get(org.id)?.length ?? 0) > 0).map((org) => org.id)), [childrenByParent, orgs])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const expandedInitialized = useRef(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('closed')
  const [drawerOrgId, setDrawerOrgId] = useState<string | null>(null)
  const [drawerPersonId, setDrawerPersonId] = useState<string | null>(null)
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  const selected = useMemo(() => orgs.find((org) => org.id === (selectedId ?? orgs[0]?.id)) ?? null, [orgs, selectedId])
  const effectiveSelectedId = selected?.id ?? ''

  const membersState = useApiData(() => apiGet<ApiList<ApiPerson>>('/users', { page_size: 200, org_id: effectiveSelectedId }), [effectiveSelectedId])
  const members = useMemo(() => effectiveSelectedId ? (membersState.data?.items ?? []) : [], [effectiveSelectedId, membersState.data?.items])

  const rolesState = useApiData(() => apiGet<ApiList<ApiRole>>('/roles'), [])
  const roles = rolesState.data?.items ?? []

  const [orgForm, setOrgForm] = useState<OrgForm>(orgToForm(selected))
  const [createForm, setCreateForm] = useState<OrgForm>(emptyCreateForm)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBlockers, setDeleteBlockers] = useState<Record<string, number> | null>(null)

  const enabled = orgs.filter((org) => org.enabled).length
  const maxDepth = orgs.length ? Math.max(...orgs.map((org) => depthOf(org.path))) + 1 : 0

  useEffect(() => {
    setOrgForm(orgToForm(selected))
  }, [selected])

  useEffect(() => {
    if (!expandedInitialized.current && orgs.length) {
      setExpandedIds(new Set(parentIds))
      expandedInitialized.current = true
    }
  }, [orgs, parentIds])

  function updateOrgForm(key: keyof OrgForm, value: string) {
    setOrgForm((current) => ({ ...current, [key]: value }))
  }

  function updateCreateForm(key: keyof OrgForm, value: string) {
    setCreateForm((current) => ({ ...current, [key]: value }))
  }

  function openOrgDrawer(org: FullApiOrg) {
    setDrawerOrgId(org.id)
    setDrawerMode('org')
  }

  function openCreateOrg(parent: FullApiOrg | null, orgType = 'department') {
    setCreateForm({ ...emptyCreateForm, parent_id: parent?.id ?? '', org_type: orgType })
    setDrawerMode('create-org')
  }

  function openCreatePerson(org: FullApiOrg) {
    setDrawerOrgId(org.id)
    setDrawerMode('create-person')
  }

  function openPersonDrawer(person: ApiPerson) {
    setDrawerPersonId(person.id)
    setDrawerMode('person')
  }

  function toggleExpanded(orgId: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(orgId)) next.delete(orgId)
      else next.add(orgId)
      return next
    })
  }

  function expandAncestors(org: FullApiOrg | null) {
    if (!org) return
    const ancestors = new Set<string>()
    let parentId = org.parent_id
    while (parentId) {
      ancestors.add(parentId)
      parentId = orgs.find((item) => item.id === parentId)?.parent_id ?? null
    }
    if (ancestors.size) {
      setExpandedIds((current) => new Set([...current, ...ancestors]))
    }
  }

  function selectOrg(org: FullApiOrg) {
    setSelectedId(org.id)
    expandAncestors(org)
  }

  async function saveOrg() {
    if (!selected) return
    setSaving('保存组织')
    setMessage(null)
    try {
      await apiPatch(`/orgs/${selected.id}`, {
        name: orgForm.name,
        code: orgForm.code,
        org_type: orgForm.org_type,
        enabled: orgForm.enabled === 'true',
        leader_ids: textToIds(orgForm.leader_ids),
        deputy_leader_ids: textToIds(orgForm.deputy_leader_ids),
        technical_supervisor_ids: textToIds(orgForm.technical_supervisor_ids),
        default_approver_ids: textToIds(orgForm.default_approver_ids),
        owner: orgForm.owner,
        location: orgForm.location,
        cost_center: orgForm.cost_center,
        description: orgForm.description,
        reason: orgForm.reason,
      })
      await reload()
      setMessageType('success')
      setMessage('组织字段已保存')
    } catch (err) {
      setMessageType('error')
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
      await apiPost(`/orgs/${selected.id}/move`, { parent_id: orgForm.parent_id, reason: orgForm.reason })
      await reload()
      setMessageType('success')
      setMessage('组织位置已更新')
    } catch (err) {
      setMessageType('error')
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
      if (createForm.parent_id) {
        setExpandedIds((current) => new Set(current).add(createForm.parent_id))
      }
      setSelectedId(result.id)
      await reload()
      setDrawerMode('closed')
      setMessageType('success')
      setMessage('新组织已创建')
    } catch (err) {
      setMessageType('error')
      setMessage(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(null)
    }
  }

  async function checkOrgDeletable(org: FullApiOrg) {
    setDeleteError(null)
    setDeleteBlockers(null)
    setDeletingOrgId(org.id)
    try {
      const result = await apiGet<{ deletable: boolean; blockers: Record<string, number> }>(`/orgs/${org.id}/delete-check`)
      setDeleteBlockers(result.blockers ?? null)
      if (result.deletable) return
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '检查删除条件失败')
    }
  }

  function cancelDeleteOrg() {
    setDeletingOrgId(null)
    setDeleteReason('')
    setDeleteError(null)
    setDeleteBlockers(null)
  }

  async function quickDeleteOrg(org: FullApiOrg) {
    setSaving('删除组织')
    setMessage(null)
    setDeleteError(null)
    try {
      await apiDelete(`/orgs/${org.id}`, { reason: deleteReason || '从部门树快速删除' })
      if (selectedId === org.id) setSelectedId(null)
      setDeletingOrgId(null)
      setDeleteReason('')
      setDeleteBlockers(null)
      await reload()
      setMessageType('success')
      setMessage('组织已删除')
    } catch (err) {
      setMessageType('error')
      const apiErr = err as { details?: Record<string, number>; message?: string }
      setDeleteError(err instanceof Error ? err.message : '删除失败')
      if (apiErr.details) {
        setDeleteBlockers(apiErr.details)
      }
    } finally {
      setSaving(null)
    }
  }

  async function deleteOrg() {
    if (!selected) return
    setSaving('删除组织')
    setMessage(null)
    try {
      await apiDelete(`/orgs/${selected.id}`, { reason: orgForm.reason || '删除组织' })
      setSelectedId(null)
      setDrawerMode('closed')
      await reload()
      setMessageType('success')
      setMessage('组织已删除')
    } catch (err) {
      setMessageType('error')
      setMessage(err instanceof Error ? err.message : '删除失败')
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

  const drawerOrg = useMemo(() => orgs.find((org) => org.id === drawerOrgId) ?? null, [orgs, drawerOrgId])
  const drawerPerson = useMemo(() => members.find((person) => person.id === drawerPersonId) ?? null, [members, drawerPersonId])

  return (
    <MainLayout title="组织" subtitle="组织树、部门治理、人员归属和审批关系">
      <div className="flex h-full min-h-0 flex-col gap-4">
        {(error || message) && (
          <div className={[
            'rounded-md px-4 py-3 text-sm',
            error || messageType === 'error' ? 'bg-color-error-bg text-color-error' : 'bg-color-success-bg text-color-success',
          ].join(' ')}>
            {error ?? message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="组织总数" value={orgs.length} />
          <Metric label="启用组织" value={enabled} />
          <Metric label="组织层级" value={maxDepth} />
          <Metric label="当前成员" value={members.length} />
        </div>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(360px,2fr)_3fr]">
          <section className="flex min-h-0 flex-col rounded-md border border-border-subtle bg-bg-secondary">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">部门树</h2>
                <p className="mt-1 text-xs text-text-muted">点击节点选中部门，悬停显示操作。</p>
              </div>
              <Button className="h-9 px-3 py-0 text-sm" onClick={() => openCreateOrg(null, 'company')}>
                <GitBranchPlus className="h-4 w-4" />新建根组织
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {(childrenByParent.get('') ?? []).map((org) => (
                <OrgTreeNode
                  key={org.id}
                  org={org}
                  selectedId={selected?.id}
                  expandedIds={expandedIds}
                  childrenByParent={childrenByParent}
                  deletingOrgId={deletingOrgId}
                  deleteReason={deleteReason}
                  deleteBlockers={deleteBlockers}
                  deleteError={deleteError}
                  saving={saving}
                  onSelect={selectOrg}
                  onToggle={toggleExpanded}
                  onDetail={openOrgDrawer}
                  onCreate={openCreateOrg}
                  onDelete={(target) => void checkOrgDeletable(target)}
                  onCancelDelete={cancelDeleteOrg}
                  onDeleteReasonChange={setDeleteReason}
                  onConfirmDelete={quickDeleteOrg}
                />
              ))}
              {!loading && orgs.length === 0 && <EmptyState title="暂无组织" desc="从右上角新建根组织开始。" />}
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col rounded-md border border-border-subtle bg-bg-secondary">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-text-muted" />
                <h3 className="text-sm font-semibold text-text-primary">部门人员</h3>
                <span className="text-xs text-text-muted">{membersState.loading ? '加载中' : `${members.length} 人`}</span>
              </div>
              {selected && (
                <Button className="h-9 px-3 py-0 text-sm" onClick={() => openCreatePerson(selected)}>
                  <Plus className="h-4 w-4" />新建人员
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {members.length > 0 ? (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>人员</Th>
                      <Th>工号</Th>
                      <Th>关系</Th>
                      <Th>工时</Th>
                      <Th>工作状态</Th>
                      <Th>账号状态</Th>
                      <Th className="w-16"> </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {members.map((person) => (
                      <Tr key={person.id} className="cursor-pointer" onClick={() => openPersonDrawer(person)}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar name={person.name} />
                            <div>
                              <div className="font-medium text-text-primary">{person.name}</div>
                              <div className="text-xs text-text-muted">{person.id.slice(0, 8)}</div>
                            </div>
                          </div>
                        </Td>
                        <Td>{person.employee_no ?? '-'}</Td>
                        <Td>{person.primary_org_id === selected?.id ? '主组织' : '兼属'}</Td>
                        <Td>{person.daily_standard_hours ?? 8}h</Td>
                        <Td><Tag variant={personTagVariant(person.work_status)}>{workStatusLabel(person.work_status)}</Tag></Td>
                        <Td><Tag variant={personTagVariant(person.account_status)}>{accountStatusLabel(person.account_status)}</Tag></Td>
                        <Td>
                          <Button variant="ghost" className="h-8 px-2" onClick={(event) => { event.stopPropagation(); openPersonDrawer(person) }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              ) : (
                <EmptyState title="暂无关联人员" desc={selected ? '该部门下还没有主组织或兼属成员。' : '从左侧选择一个部门查看人员。'} />
              )}
            </div>
          </section>
        </div>
      </div>

      {drawerMode !== 'closed' && (
        <Drawer onClose={() => setDrawerMode('closed')}>
          {drawerMode === 'org' && drawerOrg && (
            <OrgDetailForm
              org={drawerOrg}
              form={orgForm}
              saving={saving}
              moveOptions={moveOrgOptions}
              onUpdate={updateOrgForm}
              onSave={() => void saveOrg()}
              onMove={() => void moveOrg()}
              onDelete={() => void deleteOrg()}
              onCreateChild={(parent) => openCreateOrg(parent, 'department')}
              onClose={() => setDrawerMode('closed')}
            />
          )}
          {drawerMode === 'create-org' && (
            <CreateOrgForm
              form={createForm}
              allOrgOptions={allOrgOptions}
              saving={saving}
              onUpdate={updateCreateForm}
              onSubmit={() => void createOrg()}
              onCancel={() => setDrawerMode('closed')}
            />
          )}
          {drawerMode === 'person' && drawerPerson && (
            <PersonDetailForm
              person={drawerPerson}
              orgs={orgs}
              roles={roles}
              saving={saving}
              onSaved={() => { void membersState.reload(); setDrawerMode('closed'); setMessage('人员已保存') }}
              onCancel={() => setDrawerMode('closed')}
            />
          )}
          {drawerMode === 'create-person' && drawerOrg && (
            <CreatePersonForm
              orgId={drawerOrg.id}
              orgs={orgs}
              roles={roles}
              saving={saving}
              onSaved={() => { void membersState.reload(); setDrawerMode('closed'); setMessage('人员已创建') }}
              onCancel={() => setDrawerMode('closed')}
            />
          )}
        </Drawer>
      )}
    </MainLayout>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-secondary px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-text-primary">{value}</div>
    </div>
  )
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex">
      <div className="flex-1" onClick={onClose} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} role="button" tabIndex={0} aria-label="关闭抽屉" />
      <div className="flex w-[min(560px,96vw)] flex-col border-l border-border-subtle bg-bg-primary shadow-2xl">
        {children}
      </div>
    </div>
  )
}

function RoleSelector({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string }[]
  value: string[]
  onChange: (value: string[]) => void
  label?: string
}) {
  function toggle(roleId: string) {
    onChange(value.includes(roleId) ? value.filter((id) => id !== roleId) : [...value, roleId])
  }
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-sm font-medium text-text-muted">{label}</span>}
      <div className="flex flex-wrap gap-2 rounded-md border border-border-subtle bg-bg-secondary p-3">
        {options.map((role) => {
          const selected = value.includes(role.value)
          return (
            <button
              key={role.value}
              type="button"
              onClick={() => toggle(role.value)}
              className={[
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-fast',
                selected ? 'bg-primary-fill text-primary-text' : 'bg-bg-tertiary text-text-secondary hover:bg-hover-bg',
              ].join(' ')}
            >
              <span className={['flex h-4 w-4 items-center justify-center rounded-sm border text-xs', selected ? 'border-primary-text bg-primary-text text-primary-fill' : 'border-border-subtle bg-bg-secondary'].join(' ')}>
                {selected && '✓'}
              </span>
              {role.label}
            </button>
          )
        })}
        {options.length === 0 && <span className="text-sm text-text-muted">暂无可选角色</span>}
      </div>
    </div>
  )
}

interface OrgTreeNodeProps {
  org: FullApiOrg
  selectedId?: string
  expandedIds: Set<string>
  childrenByParent: Map<string, FullApiOrg[]>
  deletingOrgId?: string | null
  deleteReason: string
  deleteBlockers?: Record<string, number> | null
  deleteError?: string | null
  saving: string | null
  onSelect: (org: FullApiOrg) => void
  onToggle: (orgId: string) => void
  onDetail: (org: FullApiOrg) => void
  onCreate: (parent: FullApiOrg, orgType?: string) => void
  onDelete: (org: FullApiOrg) => void
  onCancelDelete: () => void
  onDeleteReasonChange: (value: string) => void
  onConfirmDelete: (org: FullApiOrg) => void
}

function OrgTreeNode({
  org,
  selectedId,
  expandedIds,
  childrenByParent,
  deletingOrgId,
  deleteReason,
  deleteBlockers,
  deleteError,
  saving,
  onSelect,
  onToggle,
  onDetail,
  onCreate,
  onDelete,
  onCancelDelete,
  onDeleteReasonChange,
  onConfirmDelete,
}: OrgTreeNodeProps) {
  const children = childrenByParent.get(org.id) ?? []
  const hasChildren = children.length > 0
  const expanded = expandedIds.has(org.id)
  const active = selectedId === org.id
  const depth = depthOf(org.path)
  const confirming = deletingOrgId === org.id
  const hasActiveBlockers = !!deleteBlockers && (deleteBlockers.child_count > 0 || deleteBlockers.person_count > 0 || deleteBlockers.project_count > 0 || deleteBlockers.task_count > 0)

  return (
    <div>
      <div
        className={[
          'group relative flex w-full items-center gap-2 rounded-md py-2 pr-2 text-left transition-fast',
          active ? 'bg-selected-bg text-text-primary' : 'text-text-secondary hover:bg-hover-bg',
        ].join(' ')}
        style={{ paddingLeft: `${8 + depth * 18}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-bg-primary hover:text-text-primary"
            aria-label={expanded ? `收起 ${org.name}` : `展开 ${org.name}`}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(org.id)
            }}
          >
            <ChevronRight className={['h-3.5 w-3.5 transition-transform', expanded ? 'rotate-90' : ''].join(' ')} />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect(org)}
        >
          <Building2 className="h-4 w-4 shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{org.name}</span>
        </button>
        <Badge className={active ? 'bg-bg-primary' : 'bg-bg-tertiary group-hover:bg-bg-primary'}>{orgTypeLabel(org.org_type)}</Badge>
        <div className={['shrink-0 items-center gap-1 pr-1', active ? 'flex' : 'hidden group-hover:flex'].join(' ')}>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-bg-primary hover:text-text-primary"
            title="详情"
            onClick={(event) => { event.stopPropagation(); onDetail(org) }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-bg-primary hover:text-text-primary"
            title="新建下级"
            onClick={(event) => { event.stopPropagation(); onCreate(org, 'department') }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-color-error-bg hover:text-color-error"
            title="删除"
            onClick={(event) => { event.stopPropagation(); onDelete(org) }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {confirming && (
        <div className="mx-2 mb-2 mt-1 rounded-md border border-color-error/30 bg-color-error-bg p-3" style={{ marginLeft: `${8 + depth * 18 + 28}px` }}>
          {hasActiveBlockers ? (
            <p className="text-sm text-color-error">
              无法删除 <span className="font-medium">{org.name}</span>：该部门仍有 {formatOrgBlockers(deleteBlockers)} 关联，请先清理后再删除。
            </p>
          ) : (
            <p className="text-sm text-text-secondary">确认删除 <span className="font-medium text-text-primary">{org.name}</span>？</p>
          )}
          {deleteError && (
            <p className="mt-2 text-sm text-color-error">{deleteError}</p>
          )}
          <Input
            className="mt-2"
            label=""
            value={deleteReason}
            onChange={(event) => onDeleteReasonChange(event.target.value)}
            placeholder="删除原因（选填）"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" className="h-8 px-3 text-sm" onClick={onCancelDelete}>取消</Button>
            <Button variant="danger" className="h-8 px-3 text-sm" disabled={saving !== null || hasActiveBlockers} onClick={() => onConfirmDelete(org)}>
              <Trash2 className="h-3.5 w-3.5" />确认删除
            </Button>
          </div>
        </div>
      )}
      {hasChildren && expanded && children.map((child) => (
        <OrgTreeNode
          key={child.id}
          org={child}
          selectedId={selectedId}
          expandedIds={expandedIds}
          childrenByParent={childrenByParent}
          deletingOrgId={deletingOrgId}
          deleteReason={deleteReason}
          deleteBlockers={deleteBlockers}
          deleteError={deleteError}
          saving={saving}
          onSelect={onSelect}
          onToggle={onToggle}
          onDetail={onDetail}
          onCreate={onCreate}
          onDelete={onDelete}
          onCancelDelete={onCancelDelete}
          onDeleteReasonChange={onDeleteReasonChange}
          onConfirmDelete={onConfirmDelete}
        />
      ))}
    </div>
  )
}

function DrawerHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </div>
      <button className="rounded-md p-2 text-text-muted hover:bg-hover-bg" onClick={onClose}>
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

function OrgDetailForm({
  org,
  form,
  saving,
  moveOptions,
  onUpdate,
  onSave,
  onMove,
  onDelete,
  onCreateChild,
  onClose,
}: {
  org: FullApiOrg
  form: OrgForm
  saving: string | null
  moveOptions: { value: string; label: string }[]
  onUpdate: (key: keyof OrgForm, value: string) => void
  onSave: () => void
  onMove: () => void
  onDelete: () => void
  onCreateChild: (parent: FullApiOrg) => void
  onClose: () => void
}) {
  return (
    <>
      <DrawerHeader title={org.name} subtitle={`${orgTypeLabel(org.org_type)} · ${org.enabled !== false ? '启用' : '停用'}`} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-text-muted">基本信息</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="组织名称" value={form.name} onChange={(event) => onUpdate('name', event.target.value)} />
              <Input label="组织编码" value={form.code} onChange={(event) => onUpdate('code', event.target.value)} />
              <Select label="组织类型" value={form.org_type} onChange={(event) => onUpdate('org_type', event.target.value)} options={orgTypeOptions} />
              <Select label="启用状态" value={form.enabled} onChange={(event) => onUpdate('enabled', event.target.value)} options={[
                { value: 'true', label: '启用' },
                { value: 'false', label: '停用' },
              ]} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-text-muted">管理信息</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="负责人 ID" value={form.leader_ids} onChange={(event) => onUpdate('leader_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
              <Input label="默认审批人 ID" value={form.default_approver_ids} onChange={(event) => onUpdate('default_approver_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
              <Input label="业务负责人" value={form.owner} onChange={(event) => onUpdate('owner', event.target.value)} />
              <Input label="办公地点" value={form.location} onChange={(event) => onUpdate('location', event.target.value)} />
              <Input label="成本中心" value={form.cost_center} onChange={(event) => onUpdate('cost_center', event.target.value)} />
              <label className="col-span-full flex flex-col gap-2">
                <span className="text-sm font-medium text-text-muted">组织说明</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary placeholder:text-text-placeholder transition-fast focus:border-text-muted focus:outline-none"
                  value={form.description}
                  onChange={(event) => onUpdate('description', event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-text-muted">移动到上级组织</h3>
            <div className="flex items-end gap-3">
              <Select className="flex-1" label="" value={form.parent_id} onChange={(event) => onUpdate('parent_id', event.target.value)} options={moveOptions} />
              <Button variant="secondary" className="h-11 px-4 py-0" disabled={saving !== null} onClick={onMove}>
                移动
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
        <Button variant="danger" className="mr-auto" disabled={saving !== null} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />删除
        </Button>
        <Button variant="secondary" disabled={saving !== null} onClick={() => onCreateChild(org)}>
          <GitBranchPlus className="h-4 w-4" />新建下级
        </Button>
        <Button disabled={saving !== null} onClick={onSave}>
          保存
        </Button>
      </div>
    </>
  )
}

function CreateOrgForm({
  form,
  allOrgOptions,
  saving,
  onUpdate,
  onSubmit,
  onCancel,
}: {
  form: OrgForm
  allOrgOptions: { value: string; label: string }[]
  saving: string | null
  onUpdate: (key: keyof OrgForm, value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <>
      <DrawerHeader title="新建组织/部门" subtitle="从任意层级创建下级，创建后会自动关联到树上。" onClose={onCancel} />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="组织名称" value={form.name} onChange={(event) => onUpdate('name', event.target.value)} />
            <Input label="组织编码" value={form.code} onChange={(event) => onUpdate('code', event.target.value)} />
            <Select label="上级组织" value={form.parent_id} onChange={(event) => onUpdate('parent_id', event.target.value)} options={allOrgOptions} />
            <Select label="组织类型" value={form.org_type} onChange={(event) => onUpdate('org_type', event.target.value)} options={orgTypeOptions} />
            <Input label="负责人 ID" value={form.leader_ids} onChange={(event) => onUpdate('leader_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
            <Input label="默认审批人 ID" value={form.default_approver_ids} onChange={(event) => onUpdate('default_approver_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
            <Input label="业务负责人" value={form.owner} onChange={(event) => onUpdate('owner', event.target.value)} />
            <Input label="成本中心" value={form.cost_center} onChange={(event) => onUpdate('cost_center', event.target.value)} />
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-muted">组织说明</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary transition-fast focus:border-text-muted focus:outline-none"
              value={form.description}
              onChange={(event) => onUpdate('description', event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button disabled={!form.name || !form.code || saving !== null} onClick={onSubmit}>
          <GitBranchPlus className="h-4 w-4" />创建
        </Button>
      </div>
    </>
  )
}

function PersonDetailForm({
  person,
  orgs,
  roles,
  saving,
  onSaved,
  onCancel,
}: {
  person: ApiPerson
  orgs: FullApiOrg[]
  roles: ApiRole[]
  saving: string | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(person.name)
  const [employeeNo, setEmployeeNo] = useState(person.employee_no ?? '')
  const [orgId, setOrgId] = useState(person.primary_org_id ?? '')
  const [workStatus, setWorkStatus] = useState(person.work_status ?? 'active')
  const [accountStatus, setAccountStatus] = useState(person.account_status ?? 'enabled')
  const [dailyHours, setDailyHours] = useState(String(person.daily_standard_hours ?? 8))
  const [roleIds, setRoleIds] = useState<string[]>(person.system_role_ids ?? [])
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const orgOptions = orgs.map((org) => ({ value: org.id, label: org.name }))
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }))

  async function save() {
    setError(null)
    try {
      await apiPatch(`/users/${person.id}`, {
        name,
        employee_no: employeeNo || undefined,
        primary_org_id: orgId || undefined,
        work_status: workStatus,
        account_status: accountStatus,
        daily_standard_hours: Number(dailyHours) || undefined,
        system_role_ids: roleIds.length ? roleIds : undefined,
        reason,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  return (
    <>
      <DrawerHeader title={person.name} subtitle={`${person.employee_no ?? '无工号'} · ${person.primary_org_id === orgId ? '主组织' : '兼属'}`} onClose={onCancel} />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {error && <div className="mb-4 rounded-md bg-color-error-bg px-4 py-2 text-sm text-color-error">{error}</div>}
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={person.name} className="h-12 w-12 text-base" />
          <div>
            <div className="text-base font-semibold text-text-primary">{person.name}</div>
            <div className="text-xs text-text-muted">{person.id}</div>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} />
            <Input label="工号" value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} />
            <Select label="主组织" value={orgId} onChange={(event) => setOrgId(event.target.value)} options={orgOptions} />
            <Select label="工作状态" value={workStatus} onChange={(event) => setWorkStatus(event.target.value)} options={workStatusOptions} />
            <Select label="账号状态" value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} options={accountStatusOptions} />
            <Input label="每日标准工时" type="number" value={dailyHours} onChange={(event) => setDailyHours(event.target.value)} />
          </div>
          <RoleSelector label="系统角色" options={roleOptions} value={roleIds} onChange={setRoleIds} />
          <Input label="审计备注" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="变更组织/角色/状态时填写原因" />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button disabled={saving !== null} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </>
  )
}

function CreatePersonForm({
  orgId,
  orgs,
  roles,
  saving,
  onSaved,
  onCancel,
}: {
  orgId: string
  orgs: FullApiOrg[]
  roles: ApiRole[]
  saving: string | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [employeeNo, setEmployeeNo] = useState('')
  const [primaryOrgId, setPrimaryOrgId] = useState(orgId)
  const [roleIds, setRoleIds] = useState<string[]>(roles[0]?.id ? [roles[0].id] : [])
  const [error, setError] = useState<string | null>(null)

  const orgOptions = orgs.map((org) => ({ value: org.id, label: org.name }))
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }))

  async function submit() {
    setError(null)
    try {
      await apiPost('/users', {
        name,
        login_name: loginName || undefined,
        employee_no: employeeNo || undefined,
        primary_org_id: primaryOrgId,
        system_role_ids: roleIds.length ? roleIds : [],
        account_status: 'enabled',
        daily_standard_hours: 8,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    }
  }

  return (
    <>
      <DrawerHeader title="新建人员" subtitle="在当前部门下创建人员档案。" onClose={onCancel} />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {error && <div className="mb-4 rounded-md bg-color-error-bg px-4 py-2 text-sm text-color-error">{error}</div>}
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} required />
            <Input label="登录账号" value={loginName} onChange={(event) => setLoginName(event.target.value)} />
            <Input label="工号" value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} />
            <Select label="主组织" value={primaryOrgId} onChange={(event) => setPrimaryOrgId(event.target.value)} options={orgOptions} required />
          </div>
          <RoleSelector label="默认角色" options={roleOptions} value={roleIds} onChange={setRoleIds} />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button disabled={!name || !primaryOrgId || saving !== null} onClick={() => void submit()}>
          创建
        </Button>
      </div>
    </>
  )
}
