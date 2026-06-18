import { MainLayout } from '@/components/layout'
import { AvatarGroup, Badge, Button, EmptyState, Panel, ProgressBar, Select, Table, Tabs, Tag, Tbody, Td, Th, Thead, TimelineItem, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import {
  type ApiList,
  type ApiResource,
  type ApiTask,
  formatDate,
  formatDateTime,
  numberValue,
  priorityLabel,
  resourceStatusLabel,
  taskStatusLabel,
  taskStatusVariant,
  textFromPayload,
} from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { ChevronRight, Download, Link as LinkIcon, Pencil, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface TaskDetailResponse {
  task: ApiTask
  members: Array<{
    person_id?: string
    member_role?: string
    work_content?: string
    estimated_total_hours?: number | string
    approval_status?: string
  }>
  assignments: Array<{
    id: string
    title?: string
    owner_id?: string
    status?: string
    progress?: number | string
    estimated_hours?: number | string
  }>
  available_actions: string[]
}

interface ApprovalTicket {
  id: string
  task_id?: string | null
  ticket_type?: string
  status?: string
  current_step?: number
  created_at?: string
  updated_at?: string
  payload?: Record<string, unknown>
}

interface RequirementCheck {
  items: Array<{
    resource_type?: string
    required?: boolean
    satisfied?: boolean
  }>
}

const tabs = [
  { value: 'overview', label: '概览' },
  { value: 'division', label: '分工' },
  { value: 'gantt', label: '甘特图' },
  { value: 'resources', label: '资料' },
  { value: 'approval', label: '审批' },
  { value: 'logs', label: '日志' },
]

const actionLabels: Record<string, string> = {
  submit: '提交协调',
  confirm: '确认派发',
  start: '开始任务',
  pause: '暂停',
  submit_acceptance: '提交验收',
  accept: '验收通过',
  reject: '驳回',
  archive: '归档',
}

const actionPaths: Record<string, string> = {
  submit: 'submit',
  confirm: 'confirm',
  start: 'start',
  pause: 'pause',
  submit_acceptance: 'submit-acceptance',
  accept: 'accept',
  reject: 'reject',
  archive: 'archive',
}

function loadTask(id: string) {
  return apiGet<TaskDetailResponse>(`/tasks/${id}`)
}

function loadApprovals() {
  return apiGet<ApiList<ApprovalTicket>>('/approvals', { page_size: 200 })
}

async function loadTaskResources(id: string) {
  const [linked, all, requirements] = await Promise.all([
    apiGet<ApiList<ApiResource>>('/resources', { object_type: 'task', object_id: id, page_size: 100 }),
    apiGet<ApiList<ApiResource>>('/resources', { page_size: 200 }),
    apiGet<RequirementCheck>('/resources/check-requirements', { object_type: 'task', object_id: id }).catch((): RequirementCheck => ({ items: [] })),
  ])
  return { linked: linked.items, all: all.items, requirements: requirements.items }
}

function approvalStatusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: '待处理',
    approved: '已通过',
    rejected: '已拒绝',
    adjusted_approved: '调整后通过',
    escalated: '已升级',
  }
  return map[status ?? ''] ?? status ?? '未知'
}

function approvalStatusVariant(status?: string) {
  if (status === 'approved' || status === 'adjusted_approved') return 'success'
  if (status === 'rejected') return 'error'
  if (status === 'escalated') return 'info'
  return 'warning'
}

function approvalTypeLabel(type?: string) {
  const map: Record<string, string> = {
    cross_department: '跨部门协调',
    backfill: '后补填报',
    acceptance: '验收审批',
  }
  return map[type ?? ''] ?? type ?? '协调单'
}

function resourceStatusVariant(status?: string) {
  if (status === 'confirmed' || status === 'archived') return 'success'
  if (status === 'rejected') return 'error'
  return 'info'
}

function formatSize(value: unknown) {
  const bytes = numberValue(value)
  if (!bytes) return '未知'
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

export function TaskDetailContent({
  id,
  compact = false,
  onClose,
}: {
  id: string
  compact?: boolean
  onClose?: () => void
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [acting, setActing] = useState<string | null>(null)
  const [resourceMessage, setResourceMessage] = useState<string | null>(null)
  const [selectedResourceId, setSelectedResourceId] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { data, loading, error, reload } = useApiData(() => loadTask(id), [id])
  const { data: approvalData, loading: approvalsLoading, error: approvalsError } = useApiData(loadApprovals, [])
  const { data: resourceData, loading: resourcesLoading, error: resourcesError, reload: reloadResources } = useApiData(() => loadTaskResources(id), [id])
  const task = data?.task
  const progress = numberValue(task?.progress)
  const members = data?.members ?? []
  const assignments = data?.assignments ?? []
  const memberNames = members.map((member) => member.person_id || '成员')
  const approvals = (approvalData?.items ?? []).filter((approval) => approval.task_id === id)
  const linkedResources = resourceData?.linked ?? []
  const linkedIds = new Set(linkedResources.map((resource) => resource.id))
  const availableResources = (resourceData?.all ?? []).filter((resource) => !linkedIds.has(resource.id))
  const requirements = resourceData?.requirements ?? []

  async function runAction(action: string) {
    if (!id) return
    setActing(action)
    try {
      await apiPost(`/tasks/${id}/${actionPaths[action]}`, {})
      await reload()
    } finally {
      setActing(null)
    }
  }

  async function uploadTaskResource(file: File) {
    if (!id) return
    setActing('resource-upload')
    setResourceMessage(null)
    try {
      const res = await apiPost<{ resource_id: string; version_id: string; object_key: string; s3_configured?: boolean }>('/resources/upload-url', {
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
      await apiPost('/resources/complete-upload', {
        resource_id: res.resource_id,
        version_id: res.version_id,
        object_key: res.object_key,
        filename: file.name,
        name: file.name,
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
        object_type: 'task',
        object_id: id,
      })
      setResourceMessage(res.s3_configured ? '资料已登记并关联当前任务。' : '对象存储未配置，已登记资料元数据并关联当前任务。')
      await reloadResources()
    } catch (err) {
      setResourceMessage(err instanceof Error ? err.message : '上传资料失败')
    } finally {
      setActing(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function linkExistingResource() {
    if (!id || !selectedResourceId) return
    setActing('resource-link')
    setResourceMessage(null)
    try {
      await apiPost(`/resources/${selectedResourceId}/link`, { object_type: 'task', object_id: id })
      setSelectedResourceId('')
      setResourceMessage('资料已关联当前任务。')
      await reloadResources()
    } catch (err) {
      setResourceMessage(err instanceof Error ? err.message : '关联资料失败')
    } finally {
      setActing(null)
    }
  }

  async function downloadResource(resource: ApiResource) {
    setResourceMessage(null)
    try {
      const res = await apiGet<{ download_url: string }>(`/resources/${resource.id}/download-url`)
      window.open(res.download_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setResourceMessage(err instanceof Error ? err.message : '获取下载地址失败')
    }
  }

  return (
      <div className="flex flex-col gap-6 pb-6">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Link to="/tasks" className="transition-fast hover:text-text-primary">任务</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-text-primary">{task?.name ?? '任务详情'}</span>
          </div>
          <div className="flex items-center gap-3">
            {compact && onClose && (
              <Button variant="ghost" className="h-9 w-9 px-0" aria-label="关闭任务详情" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button variant="secondary" className="h-9 px-4">
              <Pencil className="h-4 w-4" />
              编辑
            </Button>
            {data?.available_actions.map((action) => (
              <Button
                key={action}
                variant={action === 'reject' ? 'danger' : 'primary'}
                className="h-9 px-4"
                disabled={acting === action}
                onClick={() => void runAction(action)}
              >
                <Upload className="h-4 w-4" />
                {acting === action ? '处理中...' : actionLabels[action] ?? action}
              </Button>
            ))}
          </div>
        </div>

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

        {!task && !loading ? (
          <EmptyState title="未找到任务" desc="当前任务不存在或没有访问权限。" />
        ) : (
          <div className={compact ? 'grid grid-cols-[minmax(0,1fr)_320px] gap-5' : 'grid grid-cols-[1fr_360px] gap-6'}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-3">
                    <Tag variant={taskStatusVariant(task?.status)}>{taskStatusLabel(task?.status)}</Tag>
                    <h2 className="text-2xl font-semibold text-text-primary">{task?.name ?? '加载中'}</h2>
                    <span className="text-sm text-text-muted">
                      创建于 {formatDateTime(task?.created_at)} · 最后更新 {formatDateTime(task?.updated_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Tag variant={progress >= 100 ? 'success' : 'info'}>进度 {Math.round(progress)}%</Tag>
                    <AvatarGroup names={memberNames} />
                  </div>
                </div>
              </div>

              {activeTab === 'overview' && (
                <>
                  <Panel title="任务描述">
                    <p className="text-base leading-relaxed text-text-secondary">{task?.summary || '暂无任务描述。'}</p>
                  </Panel>
                  <Panel title="交付要求">
                    <p className="text-base leading-relaxed text-text-secondary">{task?.deliverable_requirement || '暂无交付要求。'}</p>
                  </Panel>
                  <Panel title="最新动态">
                    <TimelineItem title="任务数据已从后端加载" desc={task?.status ? `当前状态：${taskStatusLabel(task.status)}` : undefined} time={formatDateTime(task?.updated_at)} />
                  </Panel>
                </>
              )}

              {activeTab === 'division' && (
                <Panel title="分工">
                  <Table>
                    <Thead>
                      <Tr><Th>成员</Th><Th>角色</Th><Th>工作内容</Th><Th>预估工时</Th><Th>审批</Th></Tr>
                    </Thead>
                    <Tbody>
                      {members.map((member, index) => (
                        <Tr key={`${member.person_id}-${index}`}>
                          <Td>{member.person_id ?? '未指定'}</Td>
                          <Td>{member.member_role ?? '成员'}</Td>
                          <Td>{member.work_content || '未填写'}</Td>
                          <Td>{numberValue(member.estimated_total_hours)}h</Td>
                          <Td>{member.approval_status ?? 'pending'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                  {members.length === 0 && <EmptyState title="暂无分工" desc="该任务尚未配置成员分工。" />}
                </Panel>
              )}

              {activeTab === 'gantt' && (
                <Panel title="任务时间线">
                  <div className="relative h-12 rounded-md bg-bg-tertiary">
                    <div className="absolute left-4 right-4 top-1/2 h-2 -translate-y-1/2 rounded-full bg-border-subtle" />
                    <div className="absolute left-4 top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-sm text-text-muted">
                    <span>{formatDate(task?.start_at)}</span>
                    <span>{formatDate(task?.due_at)}</span>
                  </div>
                </Panel>
              )}

              {activeTab === 'resources' && (
                <div className="flex flex-col gap-6">
                  {(resourcesError || resourceMessage) && (
                    <div className={`rounded-md px-4 py-3 text-sm ${resourcesError ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
                      {resourcesError || resourceMessage}
                    </div>
                  )}
                  <Panel
                    title="必需资料清单"
                    right={<span className="text-sm text-text-muted">{resourcesLoading ? '检查中...' : `${requirements.length} 项`}</span>}
                  >
                    {requirements.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {requirements.map((item, index) => (
                          <div key={`${item.resource_type}-${index}`} className="flex items-center justify-between rounded-md border border-border-subtle p-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium text-text-primary">{item.resource_type ?? '资料'}</span>
                              <span className="text-xs text-text-muted">{item.required ? '必填' : '选填'}</span>
                            </div>
                            <Tag variant={item.satisfied ? 'success' : 'warning'}>{item.satisfied ? '已满足' : '缺失'}</Tag>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="未配置必需资料" desc="当前任务没有必需资料规则。" />
                    )}
                  </Panel>
                  <Panel
                    title="已关联资料"
                    right={
                      <div className="flex items-center gap-3">
                        <input
                          ref={fileRef}
                          type="file"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void uploadTaskResource(file)
                          }}
                        />
                        <Button variant="secondary" className="h-8 px-3 text-sm" disabled={acting === 'resource-upload'} onClick={() => fileRef.current?.click()}>
                          <Upload className="h-4 w-4" />上传并关联
                        </Button>
                      </div>
                    }
                  >
                    <Table>
                      <Thead><Tr><Th>资料名称</Th><Th>类型</Th><Th>版本</Th><Th>状态</Th><Th>大小</Th><Th>更新时间</Th><Th>操作</Th></Tr></Thead>
                      <Tbody>
                        {linkedResources.map((resource) => (
                          <Tr key={resource.id}>
                            <Td>
                              <div className="flex flex-col gap-1">
                                <span className="text-base font-medium text-text-primary">{resource.name}</span>
                                <span className="text-xs text-text-muted">{resource.object_key ?? resource.id}</span>
                              </div>
                            </Td>
                            <Td><Badge>{resource.resource_type ?? 'file'}</Badge></Td>
                            <Td>v{resource.version_no ?? 1}</Td>
                            <Td><Tag variant={resourceStatusVariant(resource.status)}>{resourceStatusLabel(resource.status)}</Tag></Td>
                            <Td>{formatSize(resource.file_size ?? resource.size_bytes)}</Td>
                            <Td>{formatDateTime(resource.updated_at ?? resource.created_at)}</Td>
                            <Td>
                              <button className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary" onClick={() => void downloadResource(resource)}>
                                <Download className="h-4 w-4" />下载
                              </button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    {!resourcesLoading && linkedResources.length === 0 && <EmptyState title="暂无关联资料" desc="可上传资料或从资料库选择已有资料关联。" />}
                  </Panel>
                  <Panel title="关联已有资料">
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <Select
                        value={selectedResourceId}
                        onChange={(event) => setSelectedResourceId(event.target.value)}
                        options={[{ value: '', label: availableResources.length ? '选择资料库资料' : '暂无可关联资料' }].concat(availableResources.map((resource) => ({ value: resource.id, label: `${resource.name} · ${resource.resource_type ?? 'file'}` })))}
                      />
                      <Button type="button" className="h-[42px] px-4" disabled={!selectedResourceId || acting === 'resource-link'} onClick={() => void linkExistingResource()}>
                        <LinkIcon className="h-4 w-4" />关联
                      </Button>
                    </div>
                  </Panel>
                </div>
              )}

              {activeTab === 'approval' && (
                <Panel title="审批">
                  {approvalsError && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{approvalsError}</div>}
                  <Table>
                    <Thead><Tr><Th>协调单</Th><Th>类型</Th><Th>状态</Th><Th>步骤</Th><Th>创建时间</Th><Th>操作</Th></Tr></Thead>
                    <Tbody>
                      {approvals.map((approval) => (
                        <Tr key={approval.id}>
                          <Td className="font-mono text-xs">{approval.id}</Td>
                          <Td><Badge>{approvalTypeLabel(approval.ticket_type)}</Badge></Td>
                          <Td><Tag variant={approvalStatusVariant(approval.status)}>{approvalStatusLabel(approval.status)}</Tag></Td>
                          <Td>{approval.current_step ?? 1}</Td>
                          <Td>{formatDateTime(approval.created_at)}</Td>
                          <Td>
                            <Link to={`/approvals/${approval.id}`} className="text-sm text-text-muted hover:text-text-primary">查看</Link>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                  {!approvalsLoading && approvals.length === 0 && <EmptyState title="暂无审批记录" desc="当前任务没有关联协调单。" />}
                </Panel>
              )}

              {activeTab === 'logs' && (
                <Panel title="日志">
                  <TimelineItem title="任务创建" time={formatDateTime(task?.created_at)} />
                  <TimelineItem title="任务更新" time={formatDateTime(task?.updated_at)} />
                </Panel>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <Panel title="基本信息">
                <div className="flex flex-col">
                  <InfoRow label="负责人" value={textFromPayload(task?.payload, 'owner_name', task?.owner_id ?? '未设置')} />
                  <InfoRow label="项目" value={textFromPayload(task?.payload, 'project_name', task?.project_id ?? '未关联')} />
                  <InfoRow label="类型" value={task?.sub_type || '常规'} />
                  <InfoRow label="优先级" value={priorityLabel(task?.priority)} valueClass="text-color-error" />
                  <InfoRow label="开始时间" value={formatDate(task?.start_at)} />
                  <InfoRow label="截止时间" value={formatDate(task?.due_at)} />
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm text-text-muted">进度</span>
                    <div className="flex w-40 items-center gap-3">
                      <span className="text-sm font-medium text-text-primary">{Math.round(progress)}%</span>
                      <ProgressBar value={progress} />
                    </div>
                  </div>
                </div>
              </Panel>
              <Panel title="分工概览">
                <div className="text-sm text-text-secondary">成员 {members.length} 人 · 分工 {assignments.length} 条</div>
              </Panel>
            </div>
          </div>
        )}
      </div>
  )
}

export function TaskDetailPage() {
  const { id = '' } = useParams()

  return (
    <MainLayout title="任务详情" subtitle="任务细节、分工、资料与审批">
      <TaskDetailContent id={id} />
    </MainLayout>
  )
}

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className={`text-base font-medium text-text-primary ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}
