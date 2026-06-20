import { MainLayout } from '@/components/layout'
import { Avatar, Badge, Button, EmptyState, Input, LoadIndicator, Panel, Select, Table, Tabs, Tag, Tbody, Td, Th, Thead, TimelineItem, Tr } from '@/components/ui'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api'
import {
  type ApiList,
  type ApiOrg,
  type ApiPerson,
  type ApiProject,
  type ApiSkill,
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
import { CalendarDays, Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  source_assignment_ids?: string[]
  source_tasks?: WorkloadSourceTask[]
}

interface WorkloadSourceTask {
  id: string
  task_no?: string
  name?: string
  status?: string
  due_at?: string
  progress?: number
}

interface DomainEvent {
  id: string
  event_type?: string
  object_type?: string
  actor_name?: string
  status?: string
  payload?: Record<string, unknown>
  created_at?: string
}

interface PersonDetailResponse {
  person: ApiPerson
  skills: ApiSkill[]
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
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [skillMessage, setSkillMessage] = useState<string | null>(null)
  const [savingSkills, setSavingSkills] = useState(false)
  const [projectForm, setProjectForm] = useState({ project_id: '', project_role: 'member', work_desc: '' })
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectForm, setEditingProjectForm] = useState({ project_role: 'member', work_desc: '' })
  const [projectMessage, setProjectMessage] = useState<string | null>(null)
  const [savingProject, setSavingProject] = useState(false)
  const [workloadFilter, setWorkloadFilter] = useState('all')
  const [selectedEvent, setSelectedEvent] = useState<DomainEvent | null>(null)
  const detailState = useApiData(() => apiGet<PersonDetailResponse>(`/users/${id}`), [id])
  const orgState = useApiData(() => apiGet<ApiList<ApiOrg>>('/orgs/tree'), [])
  const skillState = useApiData(() => apiGet<ApiList<ApiSkill>>('/skills'), [])
  const projectState = useApiData(() => apiGet<ApiList<ApiProject>>('/projects', { page_size: 200 }), [])
  const detail = detailState.data
  const person = detail?.person
  const allSkills = skillState.data?.items.filter((skill) => skill.enabled !== false) ?? []
  const allProjects = projectState.data?.items ?? []
  const orgs = orgState.data?.items ?? []
  const primaryOrg = orgs.find((org) => org.id === person?.primary_org_id)?.name ?? person?.primary_org_name ?? '未设置'
  const load = detail?.workload.length
    ? Math.round(detail.workload.reduce((sum, day) => sum + numberValue(day.load_rate), 0) / detail.workload.length)
    : numberValue(person?.payload?.weekly_load, person?.dispatch_enabled ? 40 : 0)
  const workloadDays = filterWorkload(detail?.workload ?? [], workloadFilter)
  const workloadSummary = summarizeWorkload(detail?.workload ?? [])

  useEffect(() => {
    setSelectedSkillIds(detail?.skills?.map((skill) => skill.id) ?? [])
  }, [detail?.skills])

  function toggleSkill(skillId: string) {
    setSelectedSkillIds((current) => (
      current.includes(skillId) ? current.filter((id) => id !== skillId) : current.concat(skillId)
    ))
  }

  async function saveSkills() {
    setSavingSkills(true)
    setSkillMessage(null)
    try {
      await apiPut(`/users/${id}/skills`, {
        skill_ids: selectedSkillIds,
        reason: '人员详情维护技能标签',
      })
      await detailState.reload()
      setSkillMessage('技能标签已保存')
    } catch (err) {
      setSkillMessage(err instanceof Error ? err.message : '保存技能失败')
    } finally {
      setSavingSkills(false)
    }
  }

  function startEditProject(project: PersonProject) {
    setEditingProjectId(project.project_id)
    setEditingProjectForm({
      project_role: project.project_role ?? 'member',
      work_desc: project.work_desc ?? '',
    })
    setProjectMessage(null)
  }

  async function addProjectMembership() {
    if (!projectForm.project_id) return
    setSavingProject(true)
    setProjectMessage(null)
    try {
      await apiPost(`/projects/${projectForm.project_id}/members`, {
        person_id: id,
        project_role: projectForm.project_role,
        work_desc: projectForm.work_desc,
      })
      await detailState.reload()
      setProjectForm({ project_id: '', project_role: 'member', work_desc: '' })
      setProjectMessage('项目归属已新增')
    } catch (err) {
      setProjectMessage(err instanceof Error ? err.message : '新增项目归属失败')
    } finally {
      setSavingProject(false)
    }
  }

  async function saveProjectMembership(projectId: string) {
    setSavingProject(true)
    setProjectMessage(null)
    try {
      await apiPatch(`/projects/${projectId}/members/${id}`, {
        project_role: editingProjectForm.project_role,
        work_desc: editingProjectForm.work_desc,
        active: true,
      })
      await detailState.reload()
      setEditingProjectId(null)
      setProjectMessage('项目归属已更新')
    } catch (err) {
      setProjectMessage(err instanceof Error ? err.message : '更新项目归属失败')
    } finally {
      setSavingProject(false)
    }
  }

  async function removeProjectMembership(projectId: string, projectName: string) {
    if (!window.confirm(`确认将 ${person?.name ?? '该人员'} 从项目「${projectName}」移除？`)) return
    setSavingProject(true)
    setProjectMessage(null)
    try {
      await apiDelete(`/projects/${projectId}/members/${id}`)
      await detailState.reload()
      setProjectMessage('项目归属已退出')
    } catch (err) {
      setProjectMessage(err instanceof Error ? err.message : '退出项目失败')
    } finally {
      setSavingProject(false)
    }
  }

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
                  {(skillMessage || skillState.error) && (
                    <div className={[
                      'mb-3 rounded-md px-3 py-2 text-sm',
                      skillState.error || skillMessage?.includes('失败') ? 'bg-color-error-bg text-color-error' : 'bg-color-success-bg text-color-success',
                    ].join(' ')}
                    >
                      {skillState.error ?? skillMessage}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pb-4">
                    {(detail.skills.length ? detail.skills.map((skill) => skill.name) : payloadArray(person, 'skills')).map((skill) => (
                      <Badge key={skill}>{skill}</Badge>
                    ))}
                    {detail.skills.length === 0 && payloadArray(person, 'skills').length === 0 && <Badge>未标记</Badge>}
                  </div>
                  <div className="grid max-h-56 grid-cols-2 gap-2 overflow-auto rounded-md border border-border-subtle bg-bg-tertiary p-3">
                    {allSkills.map((skill) => (
                      <label key={skill.id} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-secondary hover:bg-hover-bg">
                        <input type="checkbox" checked={selectedSkillIds.includes(skill.id)} onChange={() => toggleSkill(skill.id)} />
                        <span className="truncate">{skill.name}</span>
                      </label>
                    ))}
                    {allSkills.length === 0 && <span className="text-sm text-text-muted">暂无可用技能标签</span>}
                  </div>
                  <Button className="mt-4 h-9 px-3 py-0 text-sm" disabled={savingSkills} onClick={() => void saveSkills()}>
                    <Save className="h-4 w-4" />保存技能
                  </Button>
                </Panel>
              </div>
            )}
            {activeTab === 'projects' && (
              <Panel title="项目归属">
                {(projectMessage || projectState.error) && (
                  <div className={[
                    'mb-3 rounded-md px-3 py-2 text-sm',
                    projectState.error || projectMessage?.includes('失败') ? 'bg-color-error-bg text-color-error' : 'bg-color-success-bg text-color-success',
                  ].join(' ')}
                  >
                    {projectState.error ?? projectMessage}
                  </div>
                )}
                <div className="mb-4 grid gap-3 rounded-md border border-border-subtle bg-bg-tertiary p-3 lg:grid-cols-[1.3fr_0.8fr_1.4fr_auto]">
                  <Select
                    label="添加项目"
                    value={projectForm.project_id}
                    onChange={(event) => setProjectForm((current) => ({ ...current, project_id: event.target.value }))}
                    options={[{ value: '', label: '选择项目' }].concat(allProjects.map((project) => ({ value: project.id, label: `${project.name} · ${project.project_no ?? '无编号'}` })))}
                  />
                  <Select
                    label="项目身份"
                    value={projectForm.project_role}
                    onChange={(event) => setProjectForm((current) => ({ ...current, project_role: event.target.value }))}
                    options={projectRoleOptions}
                  />
                  <Input label="负责工作" value={projectForm.work_desc} onChange={(event) => setProjectForm((current) => ({ ...current, work_desc: event.target.value }))} placeholder="如：前端研发、汇报材料、需求对接" />
                  <div className="flex items-end">
                    <Button className="h-10 px-3 py-0 text-sm" disabled={savingProject || !projectForm.project_id} onClick={() => void addProjectMembership()}>
                      <Plus className="h-4 w-4" />添加
                    </Button>
                  </div>
                </div>
                <Table>
                  <Thead><Tr><Th>项目</Th><Th>组织</Th><Th>身份</Th><Th>负责工作</Th><Th>加入时间</Th><Th>状态</Th><Th>操作</Th></Tr></Thead>
                  <Tbody>
                    {detail.projects.map((project) => (
                      <Tr key={`${project.project_id}-${project.project_role}`}>
                        <Td><Link className="text-text-primary hover:underline" to={`/projects/${project.project_id}`}>{project.project_name ?? project.project_id}</Link></Td>
                        <Td>{project.owner_org_name ?? '未设置'}</Td>
                        <Td>
                          {editingProjectId === project.project_id ? (
                            <Select
                              value={editingProjectForm.project_role}
                              onChange={(event) => setEditingProjectForm((current) => ({ ...current, project_role: event.target.value }))}
                              options={projectRoleOptions}
                            />
                          ) : roleLabel(project.project_role)}
                        </Td>
                        <Td>
                          {editingProjectId === project.project_id ? (
                            <Input value={editingProjectForm.work_desc} onChange={(event) => setEditingProjectForm((current) => ({ ...current, work_desc: event.target.value }))} />
                          ) : project.work_desc || '未填写'}
                        </Td>
                        <Td>{formatDateTime(project.joined_at)}</Td>
                        <Td><Tag variant={project.active ? 'success' : 'warning'}>{project.active ? '有效' : '已退出'}</Tag></Td>
                        <Td>
                          {editingProjectId === project.project_id ? (
                            <div className="flex gap-2">
                              <Button className="h-8 px-2 py-0 text-xs" disabled={savingProject} onClick={() => void saveProjectMembership(project.project_id)}>
                                <Check className="h-3.5 w-3.5" />保存
                              </Button>
                              <Button variant="ghost" className="h-8 px-2 py-0 text-xs" onClick={() => setEditingProjectId(null)}>
                                <X className="h-3.5 w-3.5" />取消
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button variant="secondary" className="h-8 px-2 py-0 text-xs" disabled={savingProject || !project.active} onClick={() => startEditProject(project)}>
                                <Pencil className="h-3.5 w-3.5" />编辑
                              </Button>
                              <Button variant="ghost" className="h-8 px-2 py-0 text-xs text-color-error" disabled={savingProject || !project.active} onClick={() => void removeProjectMembership(project.project_id, project.project_name ?? project.project_id)}>
                                <Trash2 className="h-3.5 w-3.5" />退出
                              </Button>
                            </div>
                          )}
                        </Td>
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
                <div className="mb-4 grid gap-3 md:grid-cols-4">
                  <MetricTile label="窗口天数" value={detail.workload.length} />
                  <MetricTile label="平均负载" value={`${workloadSummary.average}%`} />
                  <MetricTile label="超载天数" value={workloadSummary.overloaded} />
                  <MetricTile label="全天占用" value={workloadSummary.fullDay} />
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {workloadFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      className={[
                        'rounded-md px-3 py-2 text-sm transition-fast',
                        workloadFilter === option.value ? 'bg-text-primary text-bg-primary' : 'bg-bg-tertiary text-text-muted hover:bg-hover-bg hover:text-text-primary',
                      ].join(' ')}
                      onClick={() => setWorkloadFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {workloadDays.map((day) => {
                    const rate = Math.round(numberValue(day.load_rate) * 100)
                    return (
                      <div key={day.date} className={[
                        'rounded-md border p-3',
                        day.full_day_occupied || rate >= 100 ? 'border-color-warning bg-color-warning-bg' : 'border-border-subtle bg-bg-tertiary',
                      ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-text-primary">{formatDate(day.date)}</span>
                          <span className="text-text-muted">{numberValue(day.committed_hours)}h / {numberValue(day.standard_hours, 8)}h</span>
                        </div>
                        <LoadIndicator value={rate} className="mt-3 w-full" />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge>{rate}%</Badge>
                          {day.full_day_occupied && <Badge>全天占用</Badge>}
                          {day.source_task_ids?.length ? <Badge>{day.source_task_ids.length} 个任务</Badge> : null}
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          {(day.source_tasks ?? []).slice(0, 3).map((task) => (
                            <Link key={task.id} className="rounded-sm bg-bg-secondary px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary" to={`/tasks/${task.id}`}>
                              <span className="font-medium">{task.name ?? task.task_no ?? task.id}</span>
                              <span className="ml-2 text-text-muted">{taskStatusLabel(task.status)}</span>
                            </Link>
                          ))}
                          {(day.source_tasks?.length ?? 0) > 3 && <span className="text-xs text-text-muted">还有 {(day.source_tasks?.length ?? 0) - 3} 个来源任务</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {workloadDays.length === 0 && <EmptyState title="暂无符合条件的负载快照" />}
              </Panel>
            )}
            {activeTab === 'history' && (
              <div className="grid gap-5 lg:grid-cols-[1fr_0.95fr]">
                <Panel title="历史记录">
                  {detail.events.length ? detail.events.map((event) => (
                    <button key={event.id} className="block w-full text-left" onClick={() => setSelectedEvent(event)}>
                      <TimelineItem title={event.event_type ?? '人员事件'} desc={`${event.actor_name ?? '系统'} · ${event.object_type ?? '事件'}`} time={formatDateTime(event.created_at)} />
                    </button>
                  )) : <EmptyState title="暂无人员历史" />}
                </Panel>
                <Panel title="事件详情">
                  {selectedEvent ? (
                    <div className="flex flex-col gap-4 text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <Info label="事件类型" value={selectedEvent.event_type ?? '未设置'} />
                        <Info label="对象类型" value={selectedEvent.object_type ?? '未设置'} />
                        <Info label="操作者" value={selectedEvent.actor_name ?? '系统'} />
                        <Info label="状态" value={selectedEvent.status ?? '未设置'} />
                        <Info label="时间" value={formatDateTime(selectedEvent.created_at)} />
                        <Info label="事件 ID" value={selectedEvent.id} />
                      </div>
                      <pre className="max-h-80 overflow-auto rounded-md bg-bg-tertiary p-3 text-xs leading-5 text-text-secondary">
                        {JSON.stringify(selectedEvent.payload ?? {}, null, 2)}
                      </pre>
                    </div>
                  ) : <EmptyState title="选择一条历史记录" desc="查看事件负载、项目归属、技能绑定等操作的详细数据。" />}
                </Panel>
              </div>
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

const projectRoleOptions = [
  { value: 'leader', label: '负责人' },
  { value: 'core', label: '核心成员' },
  { value: 'member', label: '参与成员' },
  { value: 'support', label: '支持人员' },
]

const workloadFilterOptions = [
  { value: 'all', label: '全部' },
  { value: 'overloaded', label: '超载' },
  { value: 'full_day', label: '全天占用' },
  { value: 'free', label: '有余量' },
]

function filterWorkload(days: WorkloadDay[], filter: string) {
  if (filter === 'overloaded') return days.filter((day) => numberValue(day.load_rate) >= 1)
  if (filter === 'full_day') return days.filter((day) => day.full_day_occupied)
  if (filter === 'free') return days.filter((day) => numberValue(day.load_rate) < 0.8 && !day.full_day_occupied)
  return days
}

function summarizeWorkload(days: WorkloadDay[]) {
  if (days.length === 0) return { average: 0, overloaded: 0, fullDay: 0 }
  const average = Math.round(days.reduce((sum, day) => sum + numberValue(day.load_rate), 0) / days.length * 100)
  return {
    average,
    overloaded: days.filter((day) => numberValue(day.load_rate) >= 1).length,
    fullDay: days.filter((day) => day.full_day_occupied).length,
  }
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-tertiary px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-text-primary">{value}</div>
    </div>
  )
}

function useStateFromHash(defaultValue: string) {
  return useState(defaultValue)
}
