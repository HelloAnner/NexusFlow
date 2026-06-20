/* eslint-disable react-hooks/set-state-in-effect */
import { MainLayout } from '@/components/layout'
import { AvatarGroup, Badge, Button, EmptyState, Input, Panel, ProgressBar, Select, Table, Tabs, Tag, Tbody, Td, Th, Thead, TimelineItem, Tr } from '@/components/ui'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api'
import {
  type ApiConflict,
  type ApiList,
  type ApiResource,
  type ApiTask,
  conflictTypeLabel,
  formatDate,
  formatDateTime,
  numberValue,
  priorityLabel,
  resourceStatusLabel,
  riskLabel,
  riskVariant,
  taskStatusLabel,
  taskStatusVariant,
  textFromPayload,
} from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { AlertTriangle, Archive as ArchiveIcon, Check, ChevronRight, Download, ExternalLink, Link as LinkIcon, Pencil, Plus, RotateCcw, Save, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

interface TaskDetailResponse {
  task: ApiTask
  members: Array<{
    person_id?: string
    person_name?: string
    member_role?: string
    work_content?: string
    estimated_total_hours?: number | string
    approval_status?: string
  }>
  assignments: Array<{
    id: string
    title?: string
    owner_id?: string
    owner_name?: string
    status?: string
    progress?: number | string
    estimated_hours?: number | string
    estimated_total_hours?: number | string
    confirmed_spent_hours?: number | string
    daily_commitment_hours?: number | string
    daily_commitment_type?: string
    start_date?: string
    due_date?: string
    acceptor_id?: string
    acceptor_name?: string
  }>
  progress_reports: Array<{
    id: string
    assignment_id?: string
    assignment_title?: string
    reporter_name?: string
    spent_hours?: number | string
    progress?: number | string
    content?: string
    reported_at?: string
  }>
  resources: ApiResource[]
  resource_requirements: Array<{
    id?: string
    resource_type?: string
    label?: string
    required?: boolean
    min_count?: number
    require_confirmed?: boolean
    require_stage_result?: boolean
    require_final_result?: boolean
    matched_count?: number
    confirmed_count?: number
    stage_count?: number
    final_count?: number
    satisfied?: boolean
    missing_reasons?: string[]
  }>
  resource_requirement_summary?: {
    required_count?: number
    satisfied_count?: number
    missing_count?: number
    completion_rate?: number
    can_submit_acceptance?: boolean
  }
  approvals: ApprovalTicket[]
  acceptances: Array<{
    id: string
    status?: string
    comment?: string
    submitter_name?: string
    acceptor_name?: string
    submitted_at?: string
    acted_at?: string
  }>
  change_logs: Array<{
    id: string
    change_type?: string
    reason?: string
    changed_by_name?: string
    before_payload?: Record<string, unknown>
    after_payload?: Record<string, unknown>
    created_at?: string
  }>
  events: Array<{
    id: string
    event_type?: string
    object_type?: string
    actor_name?: string
    created_at?: string
    payload?: Record<string, unknown>
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

const tabs = [
  { value: 'overview', label: '概览' },
  { value: 'division', label: '分工' },
  { value: 'gantt', label: '甘特图' },
  { value: 'resources', label: '资料' },
  { value: 'approval', label: '审批' },
  { value: 'risk', label: '风险' },
  { value: 'archive', label: '档案' },
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

function loadTaskRisks(id: string) {
  if (!id) return Promise.resolve({ items: [], total: 0 } satisfies ApiList<ApiConflict>)
  return apiGet<ApiList<ApiConflict>>('/conflicts', {
    object_type: 'task',
    object_id: id,
    status: 'open',
    page_size: 100,
  })
}

function loadResourceChoices() {
  return apiGet<ApiList<ApiResource>>('/resources', { page_size: 200 })
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

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function fromDatetimeLocal(value: string) {
  return value ? new Date(value).toISOString() : undefined
}

function changeTypeLabel(type?: string) {
  const map: Record<string, string> = {
    'task.updated': '任务变更',
    'task.submitted': '提交协调',
    'task.confirmed': '确认派发',
    'task.started': '开始任务',
    'task.paused': '暂停任务',
    'task.cancelled': '取消任务',
    'task.acceptance_requested': '提交验收',
    'task.accepted': '验收通过',
    'task.rejected': '验收退回',
    'task.archived': '任务归档',
    'assignment.created': '新增分工',
    'assignment.updated': '编辑分工',
    'assignment.progress_reported': '进度汇报',
    'assignment.confirmed': '确认成果',
    'assignment.returned': '退回分工',
    'resource_requirements.updated': '更新验收资料规则',
  }
  return map[type ?? ''] ?? type ?? '记录'
}

function assignmentStatusLabel(status?: string) {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    pending_confirmation: '待确认',
    completed: '已完成',
    returned: '退回修改',
    blocked: '阻塞',
  }
  return map[status ?? ''] ?? status ?? '未开始'
}

function conflictPeriod(conflict: ApiConflict) {
  const start = formatDate(conflict.conflict_date_start)
  const end = formatDate(conflict.conflict_date_end)
  return start === end ? start : `${start} - ${end}`
}

function approvalPendingCount(approvals: ApprovalTicket[]) {
  return approvals.filter((approval) => approval.status === 'pending' || approval.status === 'escalated').length
}

function acceptancePendingCount(acceptances: TaskDetailResponse['acceptances']) {
  return acceptances.filter((acceptance) => acceptance.status === 'submitted' || acceptance.status === 'pending').length
}

function archiveStatusText(task?: ApiTask) {
  return task?.status === 'archived' ? '已归档' : '未归档'
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
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [acting, setActing] = useState<string | null>(null)
  const [taskMessage, setTaskMessage] = useState<string | null>(null)
  const [resourceMessage, setResourceMessage] = useState<string | null>(null)
  const [selectedResourceId, setSelectedResourceId] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleDue, setScheduleDue] = useState('')
  const [scheduleReason, setScheduleReason] = useState('')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [progressValue, setProgressValue] = useState('0')
  const [spentHours, setSpentHours] = useState('0')
  const [progressContent, setProgressContent] = useState('')
  const [assignmentFormOpen, setAssignmentFormOpen] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState('')
  const [assignmentTitle, setAssignmentTitle] = useState('')
  const [assignmentOwnerId, setAssignmentOwnerId] = useState('')
  const [assignmentStartDate, setAssignmentStartDate] = useState('')
  const [assignmentDueDate, setAssignmentDueDate] = useState('')
  const [assignmentEstimatedHours, setAssignmentEstimatedHours] = useState('0')
  const [assignmentDailyHours, setAssignmentDailyHours] = useState('0')
  const [assignmentReason, setAssignmentReason] = useState('')
  const [resultAssignmentId, setResultAssignmentId] = useState('')
  const [resultSpentHours, setResultSpentHours] = useState('0')
  const [resultContent, setResultContent] = useState('')
  const [resultResourceId, setResultResourceId] = useState('')
  const [assignmentReviewReason, setAssignmentReviewReason] = useState('')
  const [requirementFormOpen, setRequirementFormOpen] = useState(false)
  const [requirementType, setRequirementType] = useState('file')
  const [requirementLabel, setRequirementLabel] = useState('')
  const [requirementMinCount, setRequirementMinCount] = useState('1')
  const [requirementStage, setRequirementStage] = useState(false)
  const [requirementFinal, setRequirementFinal] = useState(false)
  const [requirementConfirmed, setRequirementConfirmed] = useState(false)
  const [requirementReason, setRequirementReason] = useState('')
  const [uploadResourceType, setUploadResourceType] = useState('file')
  const [uploadStageResult, setUploadStageResult] = useState(false)
  const [uploadFinalResult, setUploadFinalResult] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { data, loading, error, reload } = useApiData(() => loadTask(id), [id])
  const { data: riskData, loading: risksLoading, error: risksError, reload: reloadRisks } = useApiData(() => loadTaskRisks(id), [id])
  const { data: resourceChoices, loading: resourcesLoading, error: resourcesError, reload: reloadResourceChoices } = useApiData(loadResourceChoices, [])
  const task = data?.task
  const progress = numberValue(task?.progress)
  const members = useMemo(() => data?.members ?? [], [data?.members])
  const assignments = useMemo(() => data?.assignments ?? [], [data?.assignments])
  const progressReports = data?.progress_reports ?? []
  const memberNames = members.map((member) => member.person_name || member.person_id || '成员')
  const approvals = data?.approvals ?? []
  const acceptances = data?.acceptances ?? []
  const linkedResources = data?.resources ?? []
  const openRisks = riskData?.items ?? []
  const highRiskCount = openRisks.filter((risk) => risk.risk_level === 'critical' || risk.risk_level === 'high').length
  const riskPeopleCount = new Set(openRisks.map((risk) => risk.person_id).filter(Boolean)).size
  const latestRiskTime = openRisks
    .map((risk) => risk.updated_at ?? risk.created_at)
    .filter(Boolean)
    .sort()
    .at(-1)
  const pendingApprovalCount = approvalPendingCount(approvals)
  const pendingAcceptanceCount = acceptancePendingCount(acceptances)
  const finalResources = linkedResources.filter((resource) => resource.is_final_result)
  const stageResources = linkedResources.filter((resource) => resource.is_stage_result)
  const linkedIds = new Set(linkedResources.map((resource) => resource.id))
  const availableResources = (resourceChoices?.items ?? []).filter((resource) => !linkedIds.has(resource.id))
  const requirements = data?.resource_requirements ?? []
  const requirementSummary = data?.resource_requirement_summary
  const requirementRate = Math.round(numberValue(requirementSummary?.completion_rate) * 100)
  const changeLogs = data?.change_logs ?? []
  const events = data?.events ?? []
  const personOptions = useMemo(() => {
    const options = members
      .filter((member) => member.person_id)
      .map((member) => ({ value: member.person_id as string, label: member.person_name || member.person_id || '成员' }))
    if (task?.owner_id && !options.some((option) => option.value === task.owner_id)) {
      options.unshift({ value: task.owner_id, label: textFromPayload(task.payload, 'owner_name', task.owner_id) })
    }
    return options
  }, [members, task])

  useEffect(() => {
    setScheduleStart(toDatetimeLocal(task?.start_at))
    setScheduleDue(toDatetimeLocal(task?.due_at))
  }, [task?.id, task?.start_at, task?.due_at])

  useEffect(() => {
    if (!selectedAssignmentId && assignments[0]?.id) setSelectedAssignmentId(assignments[0].id)
  }, [assignments, selectedAssignmentId])

  useEffect(() => {
    if (!resultAssignmentId && assignments[0]?.id) setResultAssignmentId(assignments[0].id)
  }, [assignments, resultAssignmentId])

  useEffect(() => {
    if (!assignmentOwnerId && personOptions[0]?.value) setAssignmentOwnerId(personOptions[0].value)
  }, [assignmentOwnerId, personOptions])

  async function runAction(action: string) {
    if (!id) return
    if (action === 'archive') {
      const confirmed = window.confirm(
        `确认归档任务「${task?.name ?? id}」？\n\n将固化 ${linkedResources.length} 份资料、${acceptances.length} 条验收记录、${openRisks.length} 条未解决风险快照；归档后会从默认列表隐藏，关联资料进入归档状态，任务只保留档案查看与追溯入口。`,
      )
      if (!confirmed) return
    }
    setActing(action)
    setTaskMessage(null)
    try {
      await apiPost(`/tasks/${id}/${actionPaths[action]}`, { reason: actionReason })
      setActionReason('')
      await reload()
      await reloadRisks()
      setTaskMessage(`${actionLabels[action] ?? action}已完成。`)
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : '任务操作失败')
    } finally {
      setActing(null)
    }
  }

  async function deleteTask() {
    if (!id) return
    setActing('delete')
    setTaskMessage(null)
    try {
      await apiDelete(`/tasks/${id}`, { reason: actionReason || '删除任务' })
      setTaskMessage('任务已删除。')
      if (compact && onClose) onClose()
      else navigate('/tasks')
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : '删除任务失败')
    } finally {
      setActing(null)
    }
  }

  async function updateSchedule() {
    if (!id) return
    if (scheduleStart && scheduleDue && new Date(scheduleDue) < new Date(scheduleStart)) {
      setTaskMessage('截止时间不能早于开始时间。')
      return
    }
    setActing('schedule')
    setTaskMessage(null)
    try {
      await apiPatch(`/tasks/${id}`, {
        start_at: fromDatetimeLocal(scheduleStart),
        due_at: fromDatetimeLocal(scheduleDue),
        reason: scheduleReason || '调整任务计划时间',
      })
      setScheduleReason('')
      setScheduleOpen(false)
      await reload()
      setTaskMessage('任务计划时间已调整，并写入变更日志。')
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : '调整任务时间失败')
    } finally {
      setActing(null)
    }
  }

  async function reportProgress() {
    if (!selectedAssignmentId) return
    setActing('progress')
    setTaskMessage(null)
    try {
      await apiPost(`/assignments/${selectedAssignmentId}/progress`, {
        progress: Number(progressValue),
        spent_hours: Number(spentHours),
        content: progressContent,
      })
      setProgressContent('')
      await reload()
      setTaskMessage('进度汇报已提交，并写入任务动态。')
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : '提交进度失败')
    } finally {
      setActing(null)
    }
  }

  function resetAssignmentForm() {
    setEditingAssignmentId('')
    setAssignmentTitle('')
    setAssignmentOwnerId(personOptions[0]?.value ?? '')
    setAssignmentStartDate(task?.start_at?.slice(0, 10) ?? '')
    setAssignmentDueDate(task?.due_at?.slice(0, 10) ?? '')
    setAssignmentEstimatedHours('0')
    setAssignmentDailyHours('0')
    setAssignmentReason('')
  }

  function openNewAssignment() {
    resetAssignmentForm()
    setAssignmentFormOpen(true)
  }

  function openEditAssignment(assignment: TaskDetailResponse['assignments'][number]) {
    setEditingAssignmentId(assignment.id)
    setAssignmentTitle(assignment.title ?? '')
    setAssignmentOwnerId(assignment.owner_id ?? personOptions[0]?.value ?? '')
    setAssignmentStartDate(assignment.start_date?.slice(0, 10) ?? '')
    setAssignmentDueDate(assignment.due_date?.slice(0, 10) ?? '')
    setAssignmentEstimatedHours(String(assignment.estimated_total_hours ?? 0))
    setAssignmentDailyHours(String(assignment.daily_commitment_hours ?? 0))
    setAssignmentReason('')
    setAssignmentFormOpen(true)
  }

  async function saveAssignment() {
    if (!id || !assignmentOwnerId) return
    if (assignmentStartDate && assignmentDueDate && assignmentDueDate < assignmentStartDate) {
      setTaskMessage('分工截止日期不能早于开始日期。')
      return
    }
    setActing('assignment-save')
    setTaskMessage(null)
    const body = {
      title: assignmentTitle,
      owner_id: assignmentOwnerId,
      start_date: assignmentStartDate || undefined,
      due_date: assignmentDueDate || undefined,
      estimated_total_hours: Number(assignmentEstimatedHours),
      daily_commitment_hours: Number(assignmentDailyHours),
      reason: assignmentReason || (editingAssignmentId ? '编辑分工' : '新增分工'),
    }
    try {
      if (editingAssignmentId) await apiPatch(`/assignments/${editingAssignmentId}`, body)
      else await apiPost(`/tasks/${id}/assignments`, body)
      setAssignmentFormOpen(false)
      resetAssignmentForm()
      await reload()
      setTaskMessage(editingAssignmentId ? '分工已更新，并写入日志。' : '分工已新增，并写入日志。')
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : '保存分工失败')
    } finally {
      setActing(null)
    }
  }

  async function submitAssignmentResult() {
    if (!resultAssignmentId) return
    setActing('assignment-result')
    setTaskMessage(null)
    try {
      await apiPost(`/assignments/${resultAssignmentId}/submit-result`, {
        spent_hours: Number(resultSpentHours),
        content: resultContent,
        reason: '提交分工成果',
        result_resource_ids: resultResourceId ? [resultResourceId] : [],
      })
      setResultContent('')
      setResultResourceId('')
      await reload()
      setTaskMessage('分工成果已提交，等待确认。')
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : '提交成果失败')
    } finally {
      setActing(null)
    }
  }

  async function reviewAssignment(assignmentId: string, action: 'confirm' | 'return') {
    setActing(`assignment-${action}`)
    setTaskMessage(null)
    try {
      await apiPost(`/assignments/${assignmentId}/${action}`, {
        reason: assignmentReviewReason || (action === 'confirm' ? '确认分工成果' : '退回分工成果'),
      })
      setAssignmentReviewReason('')
      await reload()
      setTaskMessage(action === 'confirm' ? '分工成果已确认。' : '分工已退回修改。')
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : action === 'confirm' ? '确认成果失败' : '退回分工失败')
    } finally {
      setActing(null)
    }
  }

  function requirementPayload(item: TaskDetailResponse['resource_requirements'][number]) {
    return {
      resource_type: item.resource_type ?? 'file',
      label: item.label || item.resource_type || '资料',
      required: item.required ?? true,
      min_count: item.min_count ?? 1,
      require_stage_result: item.require_stage_result ?? false,
      require_final_result: item.require_final_result ?? false,
      require_confirmed: item.require_confirmed ?? false,
    }
  }

  async function saveResourceRequirements(items: Array<Record<string, unknown>>, successMessage: string) {
    if (!id) return
    setActing('resource-requirements')
    setResourceMessage(null)
    try {
      await apiPut(`/tasks/${id}/resource-requirements`, {
        items,
        reason: requirementReason || '更新验收资料规则',
      })
      setRequirementReason('')
      await reload()
      setResourceMessage(successMessage)
    } catch (err) {
      setResourceMessage(err instanceof Error ? err.message : '保存资料规则失败')
    } finally {
      setActing(null)
    }
  }

  async function addResourceRequirement() {
    if (!requirementType.trim()) {
      setResourceMessage('资料类型不能为空。')
      return
    }
    const next = requirements.map(requirementPayload).filter((item) => item.resource_type !== requirementType.trim())
    next.push({
      resource_type: requirementType.trim(),
      label: requirementLabel.trim() || requirementType.trim(),
      required: true,
      min_count: Math.max(Number(requirementMinCount) || 1, 1),
      require_stage_result: requirementStage,
      require_final_result: requirementFinal,
      require_confirmed: requirementConfirmed,
    })
    await saveResourceRequirements(next, '验收资料规则已保存，并写入任务日志。')
    setRequirementFormOpen(false)
    setRequirementLabel('')
    setRequirementMinCount('1')
    setRequirementStage(false)
    setRequirementFinal(false)
    setRequirementConfirmed(false)
  }

  async function removeResourceRequirement(resourceType?: string) {
    if (!resourceType) return
    const next = requirements.map(requirementPayload).filter((item) => item.resource_type !== resourceType)
    await saveResourceRequirements(next, '验收资料规则已移除，并写入任务日志。')
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
        resource_type: uploadResourceType || 'file',
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
        is_stage_result: uploadStageResult,
        is_final_result: uploadFinalResult,
        object_type: 'task',
        object_id: id,
      })
      setResourceMessage(res.s3_configured ? '资料已登记并关联当前任务。' : '对象存储未配置，已登记资料元数据并关联当前任务。')
      await reload()
      await reloadResourceChoices()
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
      await reload()
      await reloadResourceChoices()
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
      <div className="flex min-h-0 flex-col gap-4 pb-4">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Link to="/tasks" className="transition-fast hover:text-text-primary">任务</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-text-primary">{task?.name ?? '任务详情'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {compact && onClose && (
              <Button variant="ghost" className="h-9 w-9 px-0" aria-label="关闭任务详情" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button variant="secondary" className="h-9 px-3 text-sm" onClick={() => setScheduleOpen((open) => !open)}>
              <Pencil className="h-4 w-4" />
              调整计划
            </Button>
            <Button variant="danger" className="h-9 px-3 text-sm" disabled={acting === 'delete'} onClick={() => void deleteTask()}>
              <Trash2 className="h-4 w-4" />
              删除
            </Button>
            {data?.available_actions.map((action) => (
              <Button
                key={action}
                variant={action === 'reject' ? 'danger' : 'primary'}
                className="h-9 px-3 text-sm"
                disabled={acting === action}
                onClick={() => void runAction(action)}
              >
                <Upload className="h-4 w-4" />
                {acting === action ? '处理中...' : actionLabels[action] ?? action}
              </Button>
            ))}
          </div>
        </div>

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="rounded-md border border-border-subtle bg-bg-secondary p-2" />
        {taskMessage && <div className="rounded-md bg-color-info-bg px-4 py-3 text-sm text-color-info">{taskMessage}</div>}
        {scheduleOpen && (
          <Panel title="调整任务计划时间">
            <div className="grid grid-cols-2 gap-3">
              <Input label="开始时间" type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} />
              <Input label="截止时间" type="datetime-local" value={scheduleDue} onChange={(event) => setScheduleDue(event.target.value)} />
            </div>
            <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
              调整原因
              <textarea
                value={scheduleReason}
                onChange={(event) => setScheduleReason(event.target.value)}
                className="min-h-20 rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                placeholder="说明为什么调整任务时间，便于后续追溯"
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" className="h-9 px-4" onClick={() => setScheduleOpen(false)}>取消</Button>
              <Button className="h-9 px-4" disabled={acting === 'schedule'} onClick={() => void updateSchedule()}>
                <Save className="h-4 w-4" />保存调整
              </Button>
            </div>
          </Panel>
        )}

        {!task && !loading ? (
          <EmptyState title="未找到任务" desc="当前任务不存在或没有访问权限。" />
        ) : (
          <div className={compact ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]' : 'grid gap-4 xl:grid-cols-[1fr_330px]'}>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-bg-secondary p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-3">
                    <Tag variant={taskStatusVariant(task?.status)}>{taskStatusLabel(task?.status)}</Tag>
                    <h2 className="text-xl font-semibold text-text-primary">{task?.name ?? '加载中'}</h2>
                    <span className="text-sm text-text-muted">
                      创建于 {formatDateTime(task?.created_at)} · 最后更新 {formatDateTime(task?.updated_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Tag variant={openRisks.length ? (highRiskCount ? 'error' : 'warning') : 'success'}>
                      {openRisks.length ? `${openRisks.length} 个风险` : '无未解决风险'}
                    </Tag>
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
                  <Panel title="异常状态解释">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-text-primary">未解决风险</span>
                          <Tag variant={openRisks.length ? (highRiskCount ? 'error' : 'warning') : 'success'}>{openRisks.length} 条</Tag>
                        </div>
                        <p className="text-sm leading-6 text-text-muted">
                          {openRisks.length ? `影响 ${riskPeopleCount} 人，${highRiskCount} 条高风险需要先处理或强制排程。` : '当前任务没有未解决排程风险。'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-text-primary">资料完整率</span>
                          <Tag variant={requirementSummary?.can_submit_acceptance ? 'success' : 'warning'}>{requirementRate}%</Tag>
                        </div>
                        <p className="text-sm leading-6 text-text-muted">
                          {requirementSummary?.can_submit_acceptance ? '必需资料已满足，可进入验收链路。' : `${requirementSummary?.missing_count ?? 0} 项必需资料仍未满足。`}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-text-primary">审批与验收</span>
                          <Tag variant={pendingApprovalCount || pendingAcceptanceCount ? 'warning' : 'success'}>
                            {pendingApprovalCount + pendingAcceptanceCount} 项待处理
                          </Tag>
                        </div>
                        <p className="text-sm leading-6 text-text-muted">
                          待审批 {pendingApprovalCount} 条，待验收 {pendingAcceptanceCount} 条。
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-text-primary">归档状态</span>
                          <Tag variant={task?.status === 'archived' ? 'success' : 'info'}>{archiveStatusText(task)}</Tag>
                        </div>
                        <p className="text-sm leading-6 text-text-muted">
                          {task?.status === 'archived' ? '任务已进入档案查看状态。' : '归档前请确认成果资料、验收记录和风险处置状态。'}
                        </p>
                      </div>
                    </div>
                  </Panel>
                  <Panel title="最新动态">
                    {events.slice(0, 5).map((event) => (
                      <TimelineItem
                        key={event.id}
                        title={changeTypeLabel(event.event_type)}
                        desc={`${event.actor_name ?? '系统'} · ${event.object_type ?? 'task'}`}
                        time={formatDateTime(event.created_at)}
                      />
                    ))}
                    {events.length === 0 && (
                      <TimelineItem title="任务数据已从后端加载" desc={task?.status ? `当前状态：${taskStatusLabel(task.status)}` : undefined} time={formatDateTime(task?.updated_at)} />
                    )}
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
                          <Td>{member.person_name ?? member.person_id ?? '未指定'}</Td>
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

              {activeTab === 'division' && (
                <div className="flex flex-col gap-6">
                  <Panel
                    title="执行分工"
                    right={
                      <Button variant="secondary" className="h-8 px-3 text-sm" onClick={openNewAssignment}>
                        <Plus className="h-4 w-4" />新增分工
                      </Button>
                    }
                  >
                    {assignmentFormOpen && (
                      <div className="mb-4 flex flex-col gap-4 rounded-md border border-border-subtle bg-bg-tertiary p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <Input label="分工名称" value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="例如报告撰写、前端开发" />
                          <Select label="负责人" value={assignmentOwnerId} onChange={(event) => setAssignmentOwnerId(event.target.value)} options={[{ value: '', label: '选择负责人' }].concat(personOptions)} />
                          <Input label="开始日期" type="date" value={assignmentStartDate} onChange={(event) => setAssignmentStartDate(event.target.value)} />
                          <Input label="截止日期" type="date" value={assignmentDueDate} onChange={(event) => setAssignmentDueDate(event.target.value)} />
                          <Input label="预计工时" type="number" min="0" step="0.5" value={assignmentEstimatedHours} onChange={(event) => setAssignmentEstimatedHours(event.target.value)} />
                          <Input label="每日投入" type="number" min="0" step="0.5" value={assignmentDailyHours} onChange={(event) => setAssignmentDailyHours(event.target.value)} />
                        </div>
                        <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
                          变更原因
                          <textarea
                            value={assignmentReason}
                            onChange={(event) => setAssignmentReason(event.target.value)}
                            className="min-h-20 rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                            placeholder="新增或调整分工的原因会进入任务日志"
                          />
                        </label>
                        <div className="flex justify-end gap-3">
                          <Button variant="ghost" className="h-9 px-4" onClick={() => setAssignmentFormOpen(false)}>取消</Button>
                          <Button className="h-9 px-4" disabled={acting === 'assignment-save' || !assignmentOwnerId} onClick={() => void saveAssignment()}>
                            <Save className="h-4 w-4" />保存分工
                          </Button>
                        </div>
                      </div>
                    )}
                    <Table>
                      <Thead>
                        <Tr><Th>分工</Th><Th>负责人</Th><Th>周期</Th><Th>进度</Th><Th>已投入</Th><Th>状态</Th><Th>操作</Th></Tr>
                      </Thead>
                      <Tbody>
                        {assignments.map((assignment) => (
                          <Tr key={assignment.id}>
                            <Td>{assignment.title ?? '未命名分工'}</Td>
                            <Td>{assignment.owner_name ?? assignment.owner_id ?? '未指定'}</Td>
                            <Td>{formatDate(assignment.start_date)} - {formatDate(assignment.due_date)}</Td>
                            <Td>
                              <div className="flex min-w-32 items-center gap-2">
                                <span>{Math.round(numberValue(assignment.progress))}%</span>
                                <ProgressBar value={numberValue(assignment.progress)} />
                              </div>
                            </Td>
                            <Td>{numberValue(assignment.confirmed_spent_hours)}h / {numberValue(assignment.estimated_total_hours)}h</Td>
                            <Td><Badge>{assignmentStatusLabel(assignment.status)}</Badge></Td>
                            <Td>
                              <div className="flex flex-wrap gap-2">
                                <button className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary" onClick={() => openEditAssignment(assignment)}>
                                  <Pencil className="h-4 w-4" />编辑
                                </button>
                                <button className="inline-flex items-center gap-1 text-sm text-color-success hover:text-text-primary" onClick={() => void reviewAssignment(assignment.id, 'confirm')}>
                                  <Check className="h-4 w-4" />确认
                                </button>
                                <button className="inline-flex items-center gap-1 text-sm text-color-error hover:text-text-primary" onClick={() => void reviewAssignment(assignment.id, 'return')}>
                                  <RotateCcw className="h-4 w-4" />退回
                                </button>
                              </div>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    {assignments.length === 0 && <EmptyState title="暂无执行分工" desc="可通过任务分工接口添加执行分工。" />}
                  </Panel>
                  <Panel title="填报进度">
                    <div className="grid grid-cols-[1.4fr_120px_120px_auto] gap-3">
                      <Select
                        label="分工"
                        value={selectedAssignmentId}
                        onChange={(event) => setSelectedAssignmentId(event.target.value)}
                        options={[{ value: '', label: assignments.length ? '选择分工' : '暂无分工' }].concat(assignments.map((assignment) => ({ value: assignment.id, label: `${assignment.title ?? '分工'} · ${assignment.owner_name ?? assignment.owner_id ?? ''}` })))}
                      />
                      <Input label="进度 %" type="number" min="0" max="100" value={progressValue} onChange={(event) => setProgressValue(event.target.value)} />
                      <Input label="投入工时" type="number" min="0" step="0.5" value={spentHours} onChange={(event) => setSpentHours(event.target.value)} />
                      <div className="flex items-end">
                        <Button className="h-[42px] px-4" disabled={!selectedAssignmentId || acting === 'progress'} onClick={() => void reportProgress()}>
                          <Upload className="h-4 w-4" />提交
                        </Button>
                      </div>
                    </div>
                    <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
                      汇报内容
                      <textarea
                        value={progressContent}
                        onChange={(event) => setProgressContent(event.target.value)}
                        className="min-h-20 rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                        placeholder="填写今日完成内容、阻塞点或阶段成果说明"
                      />
                    </label>
                  </Panel>
                  <Panel title="提交成果">
                    <div className="grid grid-cols-[1.2fr_120px_1fr_auto] gap-3">
                      <Select
                        label="分工"
                        value={resultAssignmentId}
                        onChange={(event) => setResultAssignmentId(event.target.value)}
                        options={[{ value: '', label: assignments.length ? '选择分工' : '暂无分工' }].concat(assignments.map((assignment) => ({ value: assignment.id, label: `${assignment.title ?? '分工'} · ${assignment.owner_name ?? assignment.owner_id ?? ''}` })))}
                      />
                      <Input label="投入工时" type="number" min="0" step="0.5" value={resultSpentHours} onChange={(event) => setResultSpentHours(event.target.value)} />
                      <Select
                        label="成果资料"
                        value={resultResourceId}
                        onChange={(event) => setResultResourceId(event.target.value)}
                        options={[{ value: '', label: linkedResources.length ? '可选关联资料' : '暂无关联资料' }].concat(linkedResources.map((resource) => ({ value: resource.id, label: `${resource.name} · v${resource.version_no ?? 1}` })))}
                      />
                      <div className="flex items-end">
                        <Button className="h-[42px] px-4" disabled={!resultAssignmentId || acting === 'assignment-result'} onClick={() => void submitAssignmentResult()}>
                          <Upload className="h-4 w-4" />提交成果
                        </Button>
                      </div>
                    </div>
                    <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
                      成果说明
                      <textarea
                        value={resultContent}
                        onChange={(event) => setResultContent(event.target.value)}
                        className="min-h-20 rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                        placeholder="说明成果内容、关联资料、需要验收人关注的事项"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
                      确认/退回原因
                      <textarea
                        value={assignmentReviewReason}
                        onChange={(event) => setAssignmentReviewReason(event.target.value)}
                        className="min-h-20 rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                        placeholder="确认成果或退回修改时填写，退回时必填"
                      />
                    </label>
                  </Panel>
                  <Panel title="进度汇报记录">
                    {progressReports.map((report) => (
                      <TimelineItem
                        key={report.id}
                        title={`${report.assignment_title ?? '分工'} · ${Math.round(numberValue(report.progress))}%`}
                        desc={`${report.reporter_name ?? '成员'} · 投入 ${numberValue(report.spent_hours)}h · ${report.content || '未填写说明'}`}
                        time={formatDateTime(report.reported_at)}
                      />
                    ))}
                    {progressReports.length === 0 && <EmptyState title="暂无进度汇报" desc="成员提交进度后会在这里形成过程记录。" />}
                  </Panel>
                </div>
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
                  <Panel title="资料完整率">
                    <div className="grid grid-cols-[160px_1fr_180px] items-center gap-5">
                      <div className="flex flex-col gap-1">
                        <span className="text-3xl font-semibold text-text-primary">{requirementRate}%</span>
                        <span className="text-sm text-text-muted">
                          {requirementSummary?.satisfied_count ?? 0}/{requirementSummary?.required_count ?? 0} 项已满足
                        </span>
                      </div>
                      <ProgressBar value={requirementRate} />
                      <Tag variant={requirementSummary?.can_submit_acceptance ? 'success' : 'warning'}>
                        {requirementSummary?.can_submit_acceptance ? '可提交验收' : `${requirementSummary?.missing_count ?? 0} 项待补充`}
                      </Tag>
                    </div>
                  </Panel>
                  <Panel
                    title="必需资料清单"
                    right={
                      <Button variant="secondary" className="h-8 px-3 text-sm" onClick={() => setRequirementFormOpen((open) => !open)}>
                        <Plus className="h-4 w-4" />配置规则
                      </Button>
                    }
                  >
                    {requirementFormOpen && (
                      <div className="mb-4 flex flex-col gap-4 rounded-md border border-border-subtle bg-bg-tertiary p-4">
                        <div className="grid grid-cols-[1fr_1fr_120px] gap-3">
                          <Input label="资料类型" value={requirementType} onChange={(event) => setRequirementType(event.target.value)} placeholder="report / data / ppt / file" />
                          <Input label="显示名称" value={requirementLabel} onChange={(event) => setRequirementLabel(event.target.value)} placeholder="例如整体报告" />
                          <Input label="最少份数" type="number" min="1" value={requirementMinCount} onChange={(event) => setRequirementMinCount(event.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm text-text-secondary">
                          <label className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2">
                            <input type="checkbox" checked={requirementStage} onChange={(event) => setRequirementStage(event.target.checked)} />
                            必须标记阶段成果
                          </label>
                          <label className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2">
                            <input type="checkbox" checked={requirementFinal} onChange={(event) => setRequirementFinal(event.target.checked)} />
                            必须标记最终成果
                          </label>
                          <label className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2">
                            <input type="checkbox" checked={requirementConfirmed} onChange={(event) => setRequirementConfirmed(event.target.checked)} />
                            必须已确认
                          </label>
                        </div>
                        <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
                          配置原因
                          <textarea
                            value={requirementReason}
                            onChange={(event) => setRequirementReason(event.target.value)}
                            className="min-h-20 rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                            placeholder="说明为什么新增或调整验收资料规则"
                          />
                        </label>
                        <div className="flex justify-end gap-3">
                          <Button variant="ghost" className="h-9 px-4" onClick={() => setRequirementFormOpen(false)}>取消</Button>
                          <Button className="h-9 px-4" disabled={acting === 'resource-requirements'} onClick={() => void addResourceRequirement()}>
                            <Save className="h-4 w-4" />保存规则
                          </Button>
                        </div>
                      </div>
                    )}
                    {requirements.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {requirements.map((item, index) => (
                          <div key={`${item.resource_type}-${index}`} className="flex flex-col gap-3 rounded-md border border-border-subtle p-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-text-primary">{item.label || item.resource_type || '资料'}</span>
                                <Tag variant={item.satisfied ? 'success' : 'warning'}>{item.satisfied ? '已满足' : '缺失'}</Tag>
                              </div>
                              <span className="text-xs text-text-muted">
                                类型 {item.resource_type ?? 'file'} · 至少 {item.min_count ?? 1} 份 · 已匹配 {item.matched_count ?? 0} 份
                              </span>
                              <span className="text-xs text-text-muted">
                                {item.require_stage_result ? '需阶段成果 · ' : ''}{item.require_final_result ? '需最终成果 · ' : ''}{item.require_confirmed ? '需确认' : ''}
                              </span>
                              {item.missing_reasons && item.missing_reasons.length > 0 && (
                                <span className="text-xs text-color-error">{item.missing_reasons.join('、')}</span>
                              )}
                            </div>
                            <div className="flex justify-end">
                              <button className="text-sm text-text-muted hover:text-color-error" onClick={() => void removeResourceRequirement(item.resource_type)}>
                                移除规则
                              </button>
                            </div>
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
                        <Input className="h-8 w-32 text-sm" value={uploadResourceType} onChange={(event) => setUploadResourceType(event.target.value)} placeholder="资料类型" />
                        <label className="flex items-center gap-2 text-sm text-text-muted">
                          <input type="checkbox" checked={uploadStageResult} onChange={(event) => setUploadStageResult(event.target.checked)} />
                          阶段成果
                        </label>
                        <label className="flex items-center gap-2 text-sm text-text-muted">
                          <input type="checkbox" checked={uploadFinalResult} onChange={(event) => setUploadFinalResult(event.target.checked)} />
                          最终成果
                        </label>
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
                                <span className="text-xs text-text-muted">上传人：{resource.uploader_name ?? resource.uploader_id ?? '未知'}</span>
                              </div>
                            </Td>
                            <Td>
                              <div className="flex flex-wrap gap-2">
                                <Badge>{resource.resource_type ?? 'file'}</Badge>
                                {resource.is_stage_result && <Tag variant="info">阶段成果</Tag>}
                                {resource.is_final_result && <Tag variant="success">最终成果</Tag>}
                              </div>
                            </Td>
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
                  {approvals.length === 0 && <EmptyState title="暂无审批记录" desc="当前任务没有关联协调单。" />}
                  <div className="mt-6">
                    <h4 className="mb-3 text-sm font-semibold text-text-muted">验收记录</h4>
                    {acceptances.map((acceptance) => (
                      <TimelineItem
                        key={acceptance.id}
                        title={approvalStatusLabel(acceptance.status)}
                        desc={`${acceptance.submitter_name ?? '提交人'} -> ${acceptance.acceptor_name ?? '验收人'} · ${acceptance.comment || '无备注'}`}
                        time={formatDateTime(acceptance.acted_at ?? acceptance.submitted_at)}
                      />
                    ))}
                    {acceptances.length === 0 && <EmptyState title="暂无验收记录" desc="提交验收后会在这里显示验收过程。" />}
                  </div>
                </Panel>
              )}

              {activeTab === 'risk' && (
                <div className="flex flex-col gap-6">
                  {risksError && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{risksError}</div>}
                  <Panel
                    title="风险摘要"
                    right={
                      <Button variant="secondary" className="h-8 px-3 text-sm" disabled={risksLoading} onClick={() => void reloadRisks()}>
                        <RotateCcw className="h-4 w-4" />刷新
                      </Button>
                    }
                  >
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">未解决</span>
                        <div className="mt-2 text-2xl font-semibold text-text-primary">{openRisks.length}</div>
                      </div>
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">高风险</span>
                        <div className="mt-2 text-2xl font-semibold text-color-error">{highRiskCount}</div>
                      </div>
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">影响人员</span>
                        <div className="mt-2 text-2xl font-semibold text-text-primary">{riskPeopleCount}</div>
                      </div>
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">最近风险</span>
                        <div className="mt-2 text-base font-medium text-text-primary">{formatDateTime(latestRiskTime)}</div>
                      </div>
                    </div>
                  </Panel>
                  <Panel title="未解决风险清单">
                    <Table>
                      <Thead>
                        <Tr><Th>风险</Th><Th>人员</Th><Th>时间</Th><Th>超载</Th><Th>状态</Th><Th>入口</Th></Tr>
                      </Thead>
                      <Tbody>
                        {openRisks.map((risk) => (
                          <Tr key={risk.id}>
                            <Td>
                              <div className="flex flex-col gap-1">
                                <span className="text-base font-medium text-text-primary">{conflictTypeLabel(risk.conflict_type)}</span>
                                <Tag variant={riskVariant(risk.risk_level)}>{riskLabel(risk.risk_level)}</Tag>
                              </div>
                            </Td>
                            <Td>
                              <div className="flex flex-col gap-1">
                                <span>{risk.person_name ?? risk.person_id ?? '未指定'}</span>
                                <span className="text-xs text-text-muted">{risk.owner_org_name ?? risk.person_employee_no ?? '无组织信息'}</span>
                              </div>
                            </Td>
                            <Td>{conflictPeriod(risk)}</Td>
                            <Td>{risk.overload_hours ? `${risk.overload_hours}h` : '-'}</Td>
                            <Td><Badge>{risk.status ?? 'open'}</Badge></Td>
                            <Td>
                              <div className="flex flex-col gap-2">
                                <Link to={`/conflicts?conflict=${risk.id}`} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
                                  <AlertTriangle className="h-4 w-4" />冲突中心
                                </Link>
                                <Link to={`/gantt?risk=1&task_id=${risk.task_id ?? id}`} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
                                  <ExternalLink className="h-4 w-4" />排程视图
                                </Link>
                              </div>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    {!risksLoading && openRisks.length === 0 && <EmptyState title="暂无未解决风险" desc="任务当前没有未解决的排程或资源冲突。" />}
                  </Panel>
                </div>
              )}

              {activeTab === 'archive' && (
                <div className="flex flex-col gap-6">
                  <Panel
                    title="归档摘要"
                    right={<Tag variant={task?.status === 'archived' ? 'success' : 'info'}>{archiveStatusText(task)}</Tag>}
                  >
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">成果资料</span>
                        <div className="mt-2 text-2xl font-semibold text-text-primary">{finalResources.length}</div>
                        <p className="mt-1 text-xs text-text-muted">阶段成果 {stageResources.length} 份</p>
                      </div>
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">验收记录</span>
                        <div className="mt-2 text-2xl font-semibold text-text-primary">{acceptances.length}</div>
                        <p className="mt-1 text-xs text-text-muted">待处理 {pendingAcceptanceCount} 条</p>
                      </div>
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">审批记录</span>
                        <div className="mt-2 text-2xl font-semibold text-text-primary">{approvals.length}</div>
                        <p className="mt-1 text-xs text-text-muted">待处理 {pendingApprovalCount} 条</p>
                      </div>
                      <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                        <span className="text-sm text-text-muted">未解决风险</span>
                        <div className="mt-2 text-2xl font-semibold text-color-error">{openRisks.length}</div>
                        <p className="mt-1 text-xs text-text-muted">高风险 {highRiskCount} 条</p>
                      </div>
                    </div>
                  </Panel>
                  <Panel title="档案基本信息">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-md border border-border-subtle p-3">
                        <InfoRow label="任务编号" value={task?.task_no ?? task?.id ?? '未知'} />
                        <InfoRow label="任务名称" value={task?.name ?? '未知'} />
                        <InfoRow label="项目" value={textFromPayload(task?.payload, 'project_name', task?.project_id ?? '未关联')} />
                        <InfoRow label="负责人" value={textFromPayload(task?.payload, 'owner_name', task?.owner_id ?? '未设置')} />
                      </div>
                      <div className="rounded-md border border-border-subtle p-3">
                        <InfoRow label="任务状态" value={taskStatusLabel(task?.status)} />
                        <InfoRow label="优先级" value={priorityLabel(task?.priority)} />
                        <InfoRow label="计划周期" value={`${formatDate(task?.start_at)} - ${formatDate(task?.due_at)}`} />
                        <InfoRow label="进度" value={`${Math.round(progress)}%`} />
                      </div>
                    </div>
                  </Panel>
                  <Panel title="成果与验收">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          <ArchiveIcon className="h-4 w-4" />成果资料
                        </div>
                        {linkedResources.slice(0, 6).map((resource) => (
                          <div key={resource.id} className="flex items-center justify-between gap-3 rounded-md border border-border-subtle p-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-text-primary">{resource.name}</div>
                              <div className="text-xs text-text-muted">v{resource.version_no ?? 1} · {resource.resource_type ?? 'file'} · {formatDateTime(resource.updated_at ?? resource.created_at)}</div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              {resource.is_stage_result && <Tag variant="info">阶段</Tag>}
                              {resource.is_final_result && <Tag variant="success">最终</Tag>}
                            </div>
                          </div>
                        ))}
                        {linkedResources.length === 0 && <EmptyState title="暂无成果资料" desc="任务还没有关联资料。" />}
                      </div>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          <ShieldCheck className="h-4 w-4" />验收记录
                        </div>
                        {acceptances.slice(0, 6).map((acceptance) => (
                          <TimelineItem
                            key={acceptance.id}
                            title={approvalStatusLabel(acceptance.status)}
                            desc={`${acceptance.submitter_name ?? '提交人'} -> ${acceptance.acceptor_name ?? '验收人'} · ${acceptance.comment || '无备注'}`}
                            time={formatDateTime(acceptance.acted_at ?? acceptance.submitted_at)}
                          />
                        ))}
                        {acceptances.length === 0 && <EmptyState title="暂无验收记录" desc="验收完成后会进入归档证据链。" />}
                      </div>
                    </div>
                  </Panel>
                  <Panel title="风险与日志证据">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="flex flex-col gap-3">
                        {openRisks.slice(0, 4).map((risk) => (
                          <div key={risk.id} className="rounded-md border border-border-subtle p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-text-primary">{conflictTypeLabel(risk.conflict_type)}</span>
                              <Tag variant={riskVariant(risk.risk_level)}>{riskLabel(risk.risk_level)}</Tag>
                            </div>
                            <p className="mt-2 text-sm text-text-muted">{risk.person_name ?? '未指定人员'} · {conflictPeriod(risk)}</p>
                          </div>
                        ))}
                        {openRisks.length === 0 && <EmptyState title="无未解决风险" desc="归档风险状态正常。" />}
                      </div>
                      <div className="flex flex-col gap-1">
                        {changeLogs.slice(0, 5).map((log) => (
                          <TimelineItem
                            key={log.id}
                            title={changeTypeLabel(log.change_type)}
                            desc={`${log.changed_by_name ?? '系统'}${log.reason ? ` · ${log.reason}` : ''}`}
                            time={formatDateTime(log.created_at)}
                          />
                        ))}
                        {changeLogs.length === 0 && <EmptyState title="暂无变更日志" desc="任务变更后会在这里形成审计记录。" />}
                      </div>
                    </div>
                  </Panel>
                </div>
              )}

              {activeTab === 'logs' && (
                <Panel title="日志">
                  {changeLogs.map((log) => (
                    <TimelineItem
                      key={log.id}
                      title={changeTypeLabel(log.change_type)}
                      desc={`${log.changed_by_name ?? '系统'}${log.reason ? ` · ${log.reason}` : ''}`}
                      time={formatDateTime(log.created_at)}
                    />
                  ))}
                  {changeLogs.length === 0 && (
                    <>
                      <TimelineItem title="任务创建" time={formatDateTime(task?.created_at)} />
                      <TimelineItem title="任务更新" time={formatDateTime(task?.updated_at)} />
                    </>
                  )}
                </Panel>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
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
              <Panel title="操作理由">
                <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
                  状态操作备注
                  <textarea
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                    className="min-h-20 rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                    placeholder="暂停、退回、归档等操作建议填写原因"
                  />
                </label>
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
