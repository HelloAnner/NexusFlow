import { MainLayout } from '@/components/layout'
import { Avatar, Badge, EmptyState, LoadIndicator, Panel, Table, Tabs, Tag, Tbody, Td, Th, Thead, TimelineItem, Tr } from '@/components/ui'
import { apiGet } from '@/lib/api'
import {
  type ApiList,
  type ApiOrg,
  type ApiPerson,
  type ApiTask,
  accountStatusLabel,
  formatDate,
  formatDateTime,
  numberValue,
  taskStatusLabel,
  taskStatusVariant,
  workStatusLabel,
} from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { CalendarDays, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface PersonProject {
  project_id: string
  project_name?: string
  project_no?: string
  project_status?: string
  owner_org_name?: string
  project_role?: string
  work_desc?: string
  joined_at?: string
  active?: boolean
}

interface WorkloadDay {
  date?: string
  committed_hours?: number
  standard_hours?: number
  load_rate?: number
  full_day_occupied?: boolean
  source_task_ids?: string[]
}

interface DomainEvent {
  id: string
  event_type?: string
  object_type?: string
  created_at?: string
}

interface PersonDetailResponse {
  person: ApiPerson
  projects: PersonProject[]
  tasks: ApiTask[]
  workload: WorkloadDay[]
  events: DomainEvent[]
}

const tabs = [
  { value: 'profile', label: '基础' },
  { value: 'projects', label: '项目归属' },
  { value: 'tasks', label: '当前任务' },
  { value: 'workload', label: '负载日历' },
  { value: 'history', label: '历史记录' },
]

function workVariant(status?: string) {
  if (status === 'active') return 'success'
  if (status === 'business_trip' || status === 'pending') return 'warning'
  return 'error'
}

function roleLabel(role?: string) {
  const map: Record<string, string> = {
    leader: '负责人',
    core: '核心成员',
    member: '参与成员',
    support: '支持人员',
  }
  return map[role ?? ''] ?? role ?? '成员'
}

function payloadText(person: ApiPerson | undefined, key: string, fallback = '未设置') {
  const value = person?.payload?.[key]
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

function payloadArray(person: ApiPerson | undefined, key: string) {
  const value = person?.payload?.[key]
  return Array.isArray(value) ? value.map(String) : []
}

export function PersonDetailPage() {
  const { id = '' } = useParams()
  const [activeTab, setActiveTab] = useStateFromHash('profile')
  const detailState = useApiData(() => apiGet<PersonDetailResponse>(`/users/${id}`), [id])
  const orgState = useApiData(() => apiGet<ApiList<ApiOrg>>('/orgs/tree'), [])
  const detail = detailState.data
  const person = detail?.person
  const orgs = orgState.data?.items ?? []
  const primaryOrg = orgs.find((org) => org.id === person?.primary_org_id)?.name ?? person?.primary_org_name ?? '未设置'
  const load = detail?.workload.length
    ? Math.round(detail.workload.reduce((sum, day) => sum + numberValue(day.load_rate), 0) / detail.workload.length)
    : numberValue(person?.payload?.weekly_load, person?.dispatch_enabled ? 40 : 0)

  return (
    <MainLayout title="人员详情" subtitle={person ? `${person.name} · ${primaryOrg}` : '人员工作台'}>
      <div className="flex flex-col gap-5">
        {detailState.error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{detailState.error}</div>}
        {person && (
          <div className="rounded-lg border border-border-subtle bg-bg-secondary p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar name={person.name} className="h-14 w-14 text-lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold text-text-primary">{person.name}</h1>
                    <Tag variant={workVariant(person.work_status)}>{workStatusLabel(person.work_status)}</Tag>
                    <Tag variant={person.account_status === 'enabled' ? 'success' : 'warning'}>{accountStatusLabel(person.account_status)}</Tag>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">{person.employee_no ?? '未设置工号'} · {payloadText(person, 'role_name', '成员')} · {primaryOrg}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-bg-tertiary px-4 text-sm text-text-muted hover:bg-hover-bg hover:text-text-primary" to={`/tasks/new?owner_id=${person.id}`}>
                  <Plus className="h-4 w-4" />发起任务
                </Link>
                <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-bg-tertiary px-4 text-sm text-text-muted hover:bg-hover-bg hover:text-text-primary" to={`/gantt?member_id=${person.id}`}>
                  <CalendarDays className="h-4 w-4" />查看甘特
                </Link>
                <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-bg-tertiary px-4 text-sm text-text-muted hover:bg-hover-bg hover:text-text-primary" to={`/people?q=${encodeURIComponent(person.name)}`}>
                  <Pencil className="h-4 w-4" />编辑
                </Link>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5">
              <Info label="主组织" value={primaryOrg} />
              <Info label="管理等级" value={person.management_level ?? payloadText(person, 'level')} />
              <Info label="专业等级" value={person.professional_level ?? '未设置'} />
              <Info label="每日工时" value={`${person.daily_standard_hours ?? 8} 小时`} />
              <div>
                <div className="text-xs text-text-muted">近期负载</div>
                <div className="mt-2 flex items-center gap-3"><LoadIndicator value={load} /><span className="text-sm text-text-primary">{load}%</span></div>
              </div>
            </div>
          </div>
        )}

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="rounded-lg border border-border-subtle bg-bg-secondary p-2" />

        {detailState.loading && <Panel><EmptyState title="正在加载人员详情" /></Panel>}
        {!detailState.loading && detail && person && (
          <>
            {activeTab === 'profile' && (
              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel title="基础信息">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <Info label="账号 ID" value={person.account_id ?? '未绑定'} />
                    <Info label="系统角色" value={person.system_role_ids?.join(', ') || '未设置'} />
                    <Info label="允许派发" value={person.dispatch_enabled ? '允许' : '不允许'} />
                    <Info label="手机号" value={payloadText(person, 'phone')} />
                    <Info label="邮箱" value={payloadText(person, 'email')} />
                    <Info label="所在地" value={payloadText(person, 'location')} />
                  </div>
                </Panel>
                <Panel title="技能标签">
                  <div className="flex flex-wrap gap-2">
                    {(payloadArray(person, 'skills').length ? payloadArray(person, 'skills') : ['未标记']).map((skill) => (
                      <Badge key={skill}>{skill}</Badge>
                    ))}
                  </div>
                </Panel>
              </div>
            )}
            {activeTab === 'projects' && (
              <Panel title="项目归属">
                <Table>
                  <Thead><Tr><Th>项目</Th><Th>组织</Th><Th>身份</Th><Th>负责工作</Th><Th>加入时间</Th><Th>状态</Th></Tr></Thead>
                  <Tbody>
                    {detail.projects.map((project) => (
                      <Tr key={`${project.project_id}-${project.project_role}`}>
                        <Td><Link className="text-text-primary hover:underline" to={`/projects/${project.project_id}`}>{project.project_name ?? project.project_id}</Link></Td>
                        <Td>{project.owner_org_name ?? '未设置'}</Td>
                        <Td>{roleLabel(project.project_role)}</Td>
                        <Td>{project.work_desc || '未填写'}</Td>
                        <Td>{formatDateTime(project.joined_at)}</Td>
                        <Td><Tag variant={project.active ? 'success' : 'warning'}>{project.active ? '有效' : '已退出'}</Tag></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {detail.projects.length === 0 && <EmptyState title="暂无项目归属" />}
              </Panel>
            )}
            {activeTab === 'tasks' && (
              <Panel title="当前任务">
                <Table>
                  <Thead><Tr><Th>任务</Th><Th>项目</Th><Th>状态</Th><Th>截止</Th><Th>进度</Th></Tr></Thead>
                  <Tbody>
                    {detail.tasks.map((task) => (
                      <Tr key={task.id}>
                        <Td><Link className="text-text-primary hover:underline" to={`/tasks/${task.id}`}>{task.name}</Link></Td>
                        <Td>{String(task.payload?.project_name ?? '未关联')}</Td>
                        <Td><Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag></Td>
                        <Td>{formatDate(task.due_at)}</Td>
                        <Td>{numberValue(task.progress)}%</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {detail.tasks.length === 0 && <EmptyState title="暂无当前任务" />}
              </Panel>
            )}
            {activeTab === 'workload' && (
              <Panel title="负载日历">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {detail.workload.map((day) => (
                    <div key={day.date} className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-text-primary">{formatDate(day.date)}</span>
                        <span className="text-text-muted">{numberValue(day.committed_hours)}h / {numberValue(day.standard_hours, 8)}h</span>
                      </div>
                      <LoadIndicator value={numberValue(day.load_rate)} className="mt-3 w-full" />
                      {day.full_day_occupied && <Badge className="mt-3">全天占用</Badge>}
                    </div>
                  ))}
                </div>
                {detail.workload.length === 0 && <EmptyState title="暂无负载快照" />}
              </Panel>
            )}
            {activeTab === 'history' && (
              <Panel title="历史记录">
                {detail.events.length ? detail.events.map((event) => (
                  <TimelineItem key={event.id} title={event.event_type ?? '人员事件'} desc={event.object_type} time={formatDateTime(event.created_at)} />
                )) : <EmptyState title="暂无人员历史" />}
              </Panel>
            )}
          </>
        )}
      </div>
    </MainLayout>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}

function useStateFromHash(defaultValue: string) {
  return useState(defaultValue)
}
