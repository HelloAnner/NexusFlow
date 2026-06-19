/* eslint-disable react-hooks/set-state-in-effect */
import { MainLayout } from '@/components/layout'
import { Avatar, Button, EmptyState, Input, LoadIndicator, SearchInput, Select, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPatch } from '@/lib/api'
import { type ApiList, type ApiPerson, accountStatusLabel, numberValue, workStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Edit3, Save, Search, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

interface ApiOrg {
  id: string
  name: string
  code: string
  path?: string
  org_type?: string
}

interface PersonForm {
  name: string
  employee_no: string
  primary_org_id: string
  org_membership_ids: string[]
  management_level: string
  professional_level: string
  system_role_ids: string
  work_status: string
  daily_standard_hours: string
  dispatch_enabled: string
  account_status: string
  role_name: string
  level: string
  skills: string
  weekly_load: string
  phone: string
  email: string
  location: string
  note: string
  reason: string
}

const pageSize = 20

function workVariant(status?: string) {
  if (status === 'active') return 'success'
  if (status === 'business_trip') return 'warning'
  return 'error'
}

function accountVariant(status?: string) {
  if (status === 'enabled') return 'success'
  if (status === 'pending') return 'warning'
  return 'error'
}

function payloadText(person: ApiPerson | null, key: string, fallback = '') {
  const value = person?.payload?.[key]
  return value === undefined || value === null ? fallback : String(value)
}

function payloadArrayText(person: ApiPerson | null, key: string) {
  const value = person?.payload?.[key]
  return Array.isArray(value) ? value.map(String).join(', ') : ''
}

function personToForm(person: ApiPerson | null): PersonForm {
  return {
    name: person?.name ?? '',
    employee_no: person?.employee_no ?? '',
    primary_org_id: person?.primary_org_id ?? '',
    org_membership_ids: person?.org_memberships?.filter((item) => item.membership_type !== 'primary').map((item) => item.org_id) ?? [],
    management_level: person?.management_level ?? '',
    professional_level: person?.professional_level ?? '',
    system_role_ids: person?.system_role_ids?.join(', ') ?? '',
    work_status: person?.work_status ?? 'active',
    daily_standard_hours: String(person?.daily_standard_hours ?? 8),
    dispatch_enabled: person?.dispatch_enabled === false ? 'false' : 'true',
    account_status: person?.account_status ?? 'enabled',
    role_name: payloadText(person, 'role_name'),
    level: payloadText(person, 'level'),
    skills: payloadArrayText(person, 'skills'),
    weekly_load: payloadText(person, 'weekly_load', person?.dispatch_enabled ? '40' : '0'),
    phone: payloadText(person, 'phone'),
    email: payloadText(person, 'email'),
    location: payloadText(person, 'location'),
    note: payloadText(person, 'note'),
    reason: '',
  }
}

function orgLabel(orgs: ApiOrg[], id?: string | null) {
  return orgs.find((org) => org.id === id)?.name ?? '未设置'
}

function orgNames(person: ApiPerson, orgs: ApiOrg[]) {
  const memberships = person.org_memberships ?? []
  if (memberships.length) {
    return memberships.map((item) => ({
      id: item.org_id,
      name: item.org_name ?? orgLabel(orgs, item.org_id),
      primary: item.membership_type === 'primary' || item.org_id === person.primary_org_id,
    }))
  }
  return person.primary_org_id ? [{ id: person.primary_org_id, name: person.primary_org_name ?? orgLabel(orgs, person.primary_org_id), primary: true }] : []
}

function splitComma(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function PeopleListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  const q = searchParams.get('q') ?? ''
  const [draftQ, setDraftQ] = useState(q)
  const [editing, setEditing] = useState<ApiPerson | null>(null)
  const [form, setForm] = useState<PersonForm>(personToForm(null))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const peopleState = useApiData(() => apiGet<ApiList<ApiPerson>>('/users', { page, page_size: pageSize, q }), [page, q])
  const orgState = useApiData(() => apiGet<ApiList<ApiOrg>>('/orgs/tree'), [])
  const people = useMemo(() => peopleState.data?.items ?? [], [peopleState.data?.items])
  const orgs = useMemo(() => orgState.data?.items ?? [], [orgState.data?.items])
  const total = peopleState.data?.total ?? people.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const active = people.filter((person) => person.work_status === 'active').length
  const enabled = people.filter((person) => person.account_status === 'enabled').length
  const dispatchable = people.filter((person) => person.dispatch_enabled).length

  useEffect(() => {
    setDraftQ(q)
  }, [q])

  useEffect(() => {
    setForm(personToForm(editing))
  }, [editing])

  function updateSearch(next: { page?: number; q?: string }) {
    const params = new URLSearchParams(searchParams)
    const nextPage = next.page ?? page
    const nextQ = next.q ?? q
    if (nextPage > 1) params.set('page', String(nextPage))
    else params.delete('page')
    if (nextQ.trim()) params.set('q', nextQ.trim())
    else params.delete('q')
    setSearchParams(params)
  }

  function updateField(key: keyof PersonForm, value: string) {
    if (key === 'primary_org_id') {
      setForm((current) => ({
        ...current,
        primary_org_id: value,
        org_membership_ids: current.org_membership_ids.filter((id) => id !== value),
      }))
      return
    }
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleMembership(orgId: string) {
    setForm((current) => ({
      ...current,
      org_membership_ids: current.org_membership_ids.includes(orgId)
        ? current.org_membership_ids.filter((id) => id !== orgId)
        : current.org_membership_ids.concat(orgId),
    }))
  }

  async function savePerson() {
    if (!editing) return
    setSaving(true)
    setMessage(null)
    try {
      await apiPatch(`/users/${editing.id}`, {
        name: form.name,
        employee_no: form.employee_no || undefined,
        primary_org_id: form.primary_org_id,
        org_membership_ids: form.org_membership_ids,
        management_level: form.management_level || undefined,
        professional_level: form.professional_level || undefined,
        system_role_ids: splitComma(form.system_role_ids),
        work_status: form.work_status,
        daily_standard_hours: Number(form.daily_standard_hours || 8),
        dispatch_enabled: form.dispatch_enabled === 'true',
        account_status: form.account_status,
        role_name: form.role_name,
        level: form.level,
        skills: splitComma(form.skills),
        weekly_load: Number(form.weekly_load || 0),
        phone: form.phone,
        email: form.email,
        location: form.location,
        note: form.note,
        reason: form.reason,
      })
      await peopleState.reload()
      setEditing(null)
      setMessage('人员信息已保存')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout title="人员" subtitle="人员档案、组织归属与派发状态">
      <div className="flex flex-col gap-5">
        {(peopleState.error || orgState.error || message) && (
          <div className={[
            'rounded-md px-4 py-3 text-sm',
            peopleState.error || orgState.error || message?.includes('失败') ? 'bg-color-error-bg text-color-error' : 'bg-color-success-bg text-color-success',
          ].join(' ')}
          >
            {peopleState.error ?? orgState.error ?? message}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <Metric label="人员总数" value={total} sub={peopleState.loading ? '加载中' : '真实分页'} />
          <Metric label="本页在岗" value={active} />
          <Metric label="本页账号启用" value={enabled} />
          <Metric label="本页可派发" value={dispatchable} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-4">
          <form
            className="flex min-w-0 flex-1 items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              updateSearch({ page: 1, q: draftQ })
            }}
          >
            <SearchInput className="w-full max-w-xl" placeholder="搜索姓名、工号、组织、邮箱、状态" value={draftQ} onChange={(event) => setDraftQ(event.target.value)} />
            <Button className="h-10 px-4 py-0 text-sm">
              <Search className="h-4 w-4" />搜索
            </Button>
          </form>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Users className="h-4 w-4" />
            第 {(page - 1) * pageSize + (people.length ? 1 : 0)}-{Math.min(page * pageSize, total)} 条 / 共 {total} 条
          </div>
        </div>

        <div className="flex flex-1 flex-col rounded-lg border border-border-subtle bg-bg-secondary">
          <Table>
            <Thead>
              <Tr><Th>姓名</Th><Th>归属组织</Th><Th>角色/等级</Th><Th>技能标签</Th><Th>本周负载</Th><Th>工作状态</Th><Th>账号状态</Th><Th>操作</Th></Tr>
            </Thead>
            <Tbody>
              {people.map((person) => {
                const load = numberValue(person.payload?.weekly_load, person.dispatch_enabled ? 40 : 0)
                const skills = Array.isArray(person.payload?.skills) ? person.payload.skills.map(String) : []
                const memberships = orgNames(person, orgs)
                return (
                  <Tr key={person.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={person.name} className="h-8 w-8" />
                        <div>
                          <Link className="text-base font-medium text-text-primary hover:underline" to={`/people/${person.id}`}>{person.name}</Link>
                          <div className="text-xs text-text-muted">{person.employee_no ?? '未设置工号'}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex max-w-sm flex-wrap gap-1.5">
                        {memberships.length ? memberships.map((org) => (
                          <span key={`${person.id}-${org.id}`} className={[
                            'rounded-sm px-2 py-1 text-xs',
                            org.primary ? 'bg-color-info-bg text-color-info' : 'bg-hover-bg text-text-muted',
                          ].join(' ')}
                          >
                            {org.primary ? '主 ' : ''}{org.name}
                          </span>
                        )) : <span className="text-text-muted">未设置</span>}
                      </div>
                    </Td>
                    <Td>
                      <div className="text-text-primary">{payloadText(person, 'role_name', '成员')}</div>
                      <div className="text-xs text-text-muted">{person.management_level || person.professional_level || payloadText(person, 'level', '未设置等级')}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        {(skills.length ? skills : ['未标记']).slice(0, 4).map((skill) => (
                          <span key={skill} className="rounded-sm bg-hover-bg px-2 py-1 text-xs text-text-muted">{skill}</span>
                        ))}
                      </div>
                    </Td>
                    <Td><LoadIndicator value={load} /></Td>
                    <Td><Tag variant={workVariant(person.work_status)}>{workStatusLabel(person.work_status)}</Tag></Td>
                    <Td><Tag variant={accountVariant(person.account_status)}>{accountStatusLabel(person.account_status)}</Tag></Td>
                    <Td>
                      <Button variant="secondary" className="h-9 px-3 py-0 text-sm" onClick={() => setEditing(person)}>
                        <Edit3 className="h-4 w-4" />编辑
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
          {!peopleState.loading && people.length === 0 && <EmptyState title="暂无人员" desc="换个关键词或清空搜索条件。" />}
          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-sm text-text-muted">
            <span>每页 {pageSize} 条</span>
            <div className="flex gap-2">
              <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={page <= 1} onClick={() => updateSearch({ page: page - 1 })}>上一页</Button>
              <span className="flex h-9 items-center px-2">{page} / {totalPages}</span>
              <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={page >= totalPages} onClick={() => updateSearch({ page: page + 1 })}>下一页</Button>
            </div>
          </div>
        </div>

        {editing && (
          <div className="fixed inset-y-0 right-0 z-30 flex w-[min(760px,96vw)] flex-col border-l border-border-subtle bg-bg-primary shadow-2xl">
            <div className="flex items-start justify-between border-b border-border-subtle px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">编辑人员信息</h2>
                <p className="mt-1 text-sm text-text-muted">{editing.name} · {editing.id}</p>
              </div>
              <button className="rounded-md p-2 text-text-muted hover:bg-hover-bg" onClick={() => setEditing(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <Input label="姓名" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
                <Input label="工号" value={form.employee_no} onChange={(event) => updateField('employee_no', event.target.value)} />
                <Select label="主组织" value={form.primary_org_id} onChange={(event) => updateField('primary_org_id', event.target.value)} options={orgs.map((org) => ({ value: org.id, label: org.name }))} />
                <Select label="工作状态" value={form.work_status} onChange={(event) => updateField('work_status', event.target.value)} options={[
                  { value: 'active', label: '在岗' },
                  { value: 'business_trip', label: '出差' },
                  { value: 'leave', label: '请假' },
                  { value: 'disabled', label: '停用' },
                ]} />
                <Select label="账号状态" value={form.account_status} onChange={(event) => updateField('account_status', event.target.value)} options={[
                  { value: 'enabled', label: '启用' },
                  { value: 'pending', label: '待审核' },
                  { value: 'disabled', label: '停用' },
                ]} />
                <Select label="允许派发" value={form.dispatch_enabled} onChange={(event) => updateField('dispatch_enabled', event.target.value)} options={[
                  { value: 'true', label: '允许' },
                  { value: 'false', label: '不允许' },
                ]} />
                <Input label="每日标准工时" type="number" min="0.5" step="0.5" value={form.daily_standard_hours} onChange={(event) => updateField('daily_standard_hours', event.target.value)} />
                <Input label="本周负载" type="number" min="0" step="0.5" value={form.weekly_load} onChange={(event) => updateField('weekly_load', event.target.value)} />
                <Input label="管理等级" value={form.management_level} onChange={(event) => updateField('management_level', event.target.value)} />
                <Input label="专业等级" value={form.professional_level} onChange={(event) => updateField('professional_level', event.target.value)} />
                <Input label="角色名称" value={form.role_name} onChange={(event) => updateField('role_name', event.target.value)} />
                <Input label="展示等级" value={form.level} onChange={(event) => updateField('level', event.target.value)} />
                <Input label="系统角色 ID" value={form.system_role_ids} onChange={(event) => updateField('system_role_ids', event.target.value)} placeholder="多个 ID 用逗号分隔" />
                <Input label="技能标签" value={form.skills} onChange={(event) => updateField('skills', event.target.value)} placeholder="多个标签用逗号分隔" />
                <Input label="手机号" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
                <Input label="邮箱" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
                <Input label="所在地" value={form.location} onChange={(event) => updateField('location', event.target.value)} />
                <Input label="审计备注" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} />
                <label className="col-span-2 flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-muted">兼属组织</span>
                  <div className="grid max-h-52 grid-cols-2 gap-2 overflow-auto rounded-md border border-border-subtle bg-bg-secondary p-3">
                    {orgs.map((org) => (
                      <label key={org.id} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-secondary hover:bg-hover-bg">
                        <input
                          type="checkbox"
                          checked={form.org_membership_ids.includes(org.id)}
                          disabled={form.primary_org_id === org.id}
                          onChange={() => toggleMembership(org.id)}
                        />
                        <span className="truncate">{org.name}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label className="col-span-2 flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-muted">备注</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary transition-fast focus:border-text-muted focus:outline-none"
                    value={form.note}
                    onChange={(event) => updateField('note', event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border-subtle px-6 py-4">
              <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
              <Button disabled={saving || !form.name || !form.primary_org_id} onClick={() => void savePerson()}>
                <Save className="h-4 w-4" />保存
              </Button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary px-5 py-4">
      <div className="text-sm text-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
      {sub && <div className="mt-1 text-xs text-text-muted">{sub}</div>}
    </div>
  )
}
