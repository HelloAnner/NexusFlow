import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, ProgressBar, Table, Tabs, Tag, Tbody, Td, Th, Thead, TimelineItem, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import {
  type ApiList,
  type ApiPerson,
  type ApiProject,
  type ApiResource,
  type ApiTask,
  formatDate,
  formatDateTime,
  numberValue,
  projectStatusLabel,
  projectTypeLabel,
  resourceStatusLabel,
  taskStatusLabel,
  taskStatusVariant,
  visibilityLabel,
} from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Archive, FileUp, Plus, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface ProjectMember {
  person_id: string
  person_name?: string
  primary_org_name?: string
  project_role?: string
  work_desc?: string
  joined_at?: string
  active?: boolean
}

interface VisibilityGrant {
  id: string
  subject_type?: string
  subject_id?: string
  grant_actions?: string[]
  expires_at?: string | null
}

interface DomainEvent {
  id: string
  event_type?: string
  actor_id?: string | null
  created_at?: string
}

interface ProjectDetailResponse {
  project: ApiProject
  stats: {
    task_count?: number
    in_progress_count?: number
    overdue_count?: number
    risk_count?: number
    member_count?: number
    resource_count?: number
  }
  members: ProjectMember[]
  tasks: ApiTask[]
  resources: ApiResource[]
  visibility_grants: VisibilityGrant[]
  events: DomainEvent[]
}

const tabs = [
  { value: 'overview', label: '概览' },
  { value: 'members', label: '成员' },
  { value: 'tasks', label: '任务' },
  { value: 'gantt', label: '甘特' },
  { value: 'resources', label: '资料' },
  { value: 'grants', label: '授权' },
  { value: 'logs', label: '日志' },
]

function statusVariant(status?: string) {
  if (status === 'completed' || status === 'archived') return 'success'
  if (status === 'paused') return 'warning'
  return 'info'
}

function resourceVariant(status?: string) {
  if (status === 'confirmed' || status === 'archived') return 'success'
  if (status === 'rejected') return 'error'
  return 'info'
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

function formatSize(value: unknown) {
  const bytes = numberValue(value)
  if (!bytes) return '未知'
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [message, setMessage] = useState<string | null>(null)
  const [memberId, setMemberId] = useState('')
  const [memberRole, setMemberRole] = useState('member')
  const [workDesc, setWorkDesc] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const detailState = useApiData(() => apiGet<ProjectDetailResponse>(`/projects/${id}`), [id])
  const peopleState = useApiData(() => apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }), [])
  const detail = detailState.data
  const project = detail?.project
  const stats = detail?.stats ?? {}
  const people = peopleState.data?.items ?? []

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memberId) return
    setActing('member')
    setMessage(null)
    try {
      await apiPost(`/projects/${id}/members`, {
        person_id: memberId,
        project_role: memberRole,
        work_desc: workDesc,
      })
      setMemberId('')
      setWorkDesc('')
      await detailState.reload()
      setMessage('项目成员已更新')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '添加成员失败')
    } finally {
      setActing(null)
    }
  }

  async function archiveProject() {
    setActing('archive')
    setMessage(null)
    try {
      await apiPost(`/projects/${id}/archive`, {})
      await detailState.reload()
      setMessage('项目已归档')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '项目归档失败')
    } finally {
      setActing(null)
    }
  }

  async function uploadProjectResource(file: File) {
    setActing('upload')
    setMessage(null)
    try {
      const upload = await apiPost<{ resource_id: string; version_id: string; object_key: string; s3_configured?: boolean }>('/resources/upload-url', {
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
      await apiPost('/resources/complete-upload', {
        resource_id: upload.resource_id,
        version_id: upload.version_id,
        object_key: upload.object_key,
        filename: file.name,
        name: file.name,
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
        object_type: 'project',
        object_id: id,
      })
      await detailState.reload()
      setMessage(upload.s3_configured ? '项目资料已登记并关联。' : '对象存储未配置，已登记资料元数据并关联项目。')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '上传项目资料失败')
    } finally {
      setActing(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <MainLayout title="项目详情" subtitle={project ? `${project.project_no ?? '未编号'} · ${project.name}` : '项目工作台'}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        {(detailState.error || message) && (
          <div className={`rounded-md px-4 py-3 text-sm ${detailState.error ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
            {detailState.error ?? message}
          </div>
        )}

        {project && (
          <div className="rounded-md border border-border-subtle bg-bg-secondary p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-text-primary">{project.name}</h1>
                  <Tag variant={statusVariant(project.status)}>{projectStatusLabel(project.status)}</Tag>
                  <Badge>{visibilityLabel(project.visibility)}</Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-text-muted">{project.summary || '暂无项目概述'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="inline-flex h-9 items-center gap-2 rounded-md bg-bg-tertiary px-3 text-sm text-text-muted hover:bg-hover-bg hover:text-text-primary" to={`/tasks/new?project_id=${project.id}`}>
                  <Plus className="h-4 w-4" />新建任务
                </Link>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadProjectResource(file)
                  }}
                />
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={acting === 'upload'} onClick={() => fileRef.current?.click()}>
                  <FileUp className="h-4 w-4" />上传资料
                </Button>
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={acting === 'archive' || project.status === 'archived'} onClick={() => void archiveProject()}>
                  <Archive className="h-4 w-4" />归档
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-text-secondary md:grid-cols-4">
              <Info label="项目类型" value={`${projectTypeLabel(project.project_type)} / ${project.level ?? '未分级'}`} />
              <Info label="归属组织" value={String(project.payload?.owner_org_name ?? '未设置')} />
              <Info label="负责人" value={String(project.payload?.leader_name ?? '未设置')} />
              <Info label="起止时间" value={`${formatDate(project.start_date)} - ${formatDate(project.end_date)}`} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Metric label="任务" value={stats.task_count ?? 0} />
          <Metric label="进行中" value={stats.in_progress_count ?? 0} />
          <Metric label="延期" value={stats.overdue_count ?? 0} />
          <Metric label="风险" value={stats.risk_count ?? 0} />
          <Metric label="成员" value={stats.member_count ?? 0} />
          <Metric label="资料" value={stats.resource_count ?? 0} />
        </div>

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="rounded-md border border-border-subtle bg-bg-secondary p-2" />

        {detailState.loading && <Panel><EmptyState title="正在加载项目详情" /></Panel>}
        {!detailState.loading && detail && (
          <>
            {activeTab === 'overview' && (
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <Panel title="当前重点任务">
                  <TaskTable tasks={detail.tasks.slice(0, 6)} />
                </Panel>
                <Panel title="最近动态">
                  {detail.events.length ? detail.events.slice(0, 6).map((event) => (
                    <TimelineItem key={event.id} title={event.event_type ?? '项目事件'} time={formatDateTime(event.created_at)} />
                  )) : <EmptyState title="暂无日志" desc="项目变更后会在这里显示。" />}
                </Panel>
              </div>
            )}
            {activeTab === 'members' && (
              <Panel
                title="项目成员"
                right={
                  <form className="flex flex-wrap items-center gap-2" onSubmit={addMember}>
                    <select className="h-9 rounded-md border border-border-subtle bg-bg-tertiary px-3 text-sm text-text-primary" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                      <option value="">选择人员</option>
                      {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                    <select className="h-9 rounded-md border border-border-subtle bg-bg-tertiary px-3 text-sm text-text-primary" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                      <option value="member">参与成员</option>
                      <option value="core">核心成员</option>
                      <option value="support">支持人员</option>
                      <option value="leader">负责人</option>
                    </select>
                    <input className="h-9 rounded-md border border-border-subtle bg-bg-tertiary px-3 text-sm text-text-primary" placeholder="负责工作" value={workDesc} onChange={(event) => setWorkDesc(event.target.value)} />
                    <Button className="h-9 px-3 py-0 text-sm" disabled={!memberId || acting === 'member'}><Users className="h-4 w-4" />添加</Button>
                  </form>
                }
              >
                <Table>
                  <Thead><Tr><Th>成员</Th><Th>组织</Th><Th>身份</Th><Th>负责工作</Th><Th>加入时间</Th><Th>状态</Th></Tr></Thead>
                  <Tbody>
                    {detail.members.map((member) => (
                      <Tr key={`${member.person_id}-${member.project_role}`}>
                        <Td><Link className="text-text-primary hover:underline" to={`/people/${member.person_id}`}>{member.person_name ?? member.person_id}</Link></Td>
                        <Td>{member.primary_org_name ?? '未设置'}</Td>
                        <Td>{roleLabel(member.project_role)}</Td>
                        <Td>{member.work_desc || '未填写'}</Td>
                        <Td>{formatDateTime(member.joined_at)}</Td>
                        <Td><Tag variant={member.active ? 'success' : 'warning'}>{member.active ? '有效' : '已退出'}</Tag></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {detail.members.length === 0 && <EmptyState title="暂无项目成员" />}
              </Panel>
            )}
            {activeTab === 'tasks' && <Panel title="项目任务"><TaskTable tasks={detail.tasks} /></Panel>}
            {activeTab === 'gantt' && (
              <Panel title="项目甘特">
                <div className="flex flex-col gap-3">
                  {detail.tasks.map((task) => (
                    <div key={task.id} className="grid grid-cols-[220px_1fr_120px] items-center gap-4 text-sm">
                      <Link className="truncate text-text-primary hover:underline" to={`/tasks/${task.id}`}>{task.name}</Link>
                      <ProgressBar value={numberValue(task.progress)} className="h-2" />
                      <span className="text-text-muted">{formatDate(task.start_at)} - {formatDate(task.due_at)}</span>
                    </div>
                  ))}
                  {detail.tasks.length === 0 && <EmptyState title="暂无任务时间线" />}
                </div>
              </Panel>
            )}
            {activeTab === 'resources' && (
              <Panel title="项目资料">
                <ResourceTable resources={detail.resources} />
              </Panel>
            )}
            {activeTab === 'grants' && (
              <Panel title="隐藏项目授权">
                <Table>
                  <Thead><Tr><Th>对象类型</Th><Th>对象 ID</Th><Th>授权动作</Th><Th>失效时间</Th></Tr></Thead>
                  <Tbody>
                    {detail.visibility_grants.map((grant) => (
                      <Tr key={grant.id}>
                        <Td>{grant.subject_type}</Td>
                        <Td>{grant.subject_id}</Td>
                        <Td>{grant.grant_actions?.join(', ') || '查看'}</Td>
                        <Td>{formatDateTime(grant.expires_at)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {detail.visibility_grants.length === 0 && <EmptyState title="暂无显式授权" />}
              </Panel>
            )}
            {activeTab === 'logs' && (
              <Panel title="项目日志">
                {detail.events.length ? detail.events.map((event) => (
                  <TimelineItem key={event.id} title={event.event_type ?? '项目事件'} desc={event.actor_id ? `操作人：${event.actor_id}` : undefined} time={formatDateTime(event.created_at)} />
                )) : <EmptyState title="暂无项目日志" />}
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
      <div className="mt-1 truncate text-sm font-medium text-text-primary">{value}</div>
    </div>
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

function TaskTable({ tasks }: { tasks: ApiTask[] }) {
  return (
    <>
      <Table>
        <Thead><Tr><Th>任务</Th><Th>状态</Th><Th>负责人</Th><Th>截止</Th><Th>进度</Th></Tr></Thead>
        <Tbody>
          {tasks.map((task) => (
            <Tr key={task.id}>
              <Td><Link className="text-text-primary hover:underline" to={`/tasks/${task.id}`}>{task.name}</Link></Td>
              <Td><Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag></Td>
              <Td>{String(task.payload?.owner_name ?? '未设置')}</Td>
              <Td>{formatDate(task.due_at)}</Td>
              <Td><ProgressBar value={numberValue(task.progress)} className="h-1.5" /></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {tasks.length === 0 && <EmptyState title="暂无项目任务" />}
    </>
  )
}

function ResourceTable({ resources }: { resources: ApiResource[] }) {
  return (
    <>
      <Table>
        <Thead><Tr><Th>资料</Th><Th>类型</Th><Th>状态</Th><Th>版本</Th><Th>大小</Th><Th>更新时间</Th></Tr></Thead>
        <Tbody>
          {resources.map((resource) => (
            <Tr key={resource.id}>
              <Td><Link className="text-text-primary hover:underline" to={`/resources/${resource.id}`}>{resource.name}</Link></Td>
              <Td><Badge>{resource.resource_type ?? 'file'}</Badge></Td>
              <Td><Tag variant={resourceVariant(resource.status)}>{resourceStatusLabel(resource.status)}</Tag></Td>
              <Td>v{resource.version_no ?? 1}</Td>
              <Td>{formatSize(resource.file_size ?? resource.size_bytes)}</Td>
              <Td>{formatDateTime(resource.updated_at)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {resources.length === 0 && <EmptyState title="暂无项目资料" />}
    </>
  )
}
