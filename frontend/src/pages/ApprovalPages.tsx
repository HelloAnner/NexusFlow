import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, Panel, Table, Tabs, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { ArrowLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

interface ApprovalTicket {
  id: string
  task_id?: string | null
  ticket_type?: string
  target_person_ids?: string[]
  target_org_id?: string | null
  status?: string
  current_step?: number
  created_at?: string
  updated_at?: string
  payload?: Record<string, unknown>
}

interface ApprovalStep {
  id: string
  ticket_id: string
  step_order?: number
  approver_id?: string | null
  approver_source?: string
  action?: string | null
  comment?: string
  acted_at?: string | null
}

interface ApprovalDetail {
  ticket: ApprovalTicket
  steps: ApprovalStep[]
}

const statusTabs = [
  { value: 'pending', label: '待处理' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'escalated', label: '已升级' },
  { value: 'all', label: '全部' },
]

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
  if (status === 'approved' || status === 'adjusted_approved') return 'success' as const
  if (status === 'rejected') return 'error' as const
  if (status === 'escalated') return 'info' as const
  return 'warning' as const
}

function ticketTypeLabel(type?: string) {
  const map: Record<string, string> = {
    cross_department: '跨部门协调',
    backfill: '后补填报',
    acceptance: '验收审批',
  }
  return map[type ?? ''] ?? type ?? '协调单'
}

function loadApprovals(status: string) {
  return apiGet<ApiList<ApprovalTicket>>('/approvals', {
    status: status === 'all' ? undefined : status,
    page_size: 100,
  })
}

export function ApprovalListPage() {
  const [status, setStatus] = useState('pending')
  const { data, loading, error } = useApiData(() => loadApprovals(status), [status])
  const approvals = data?.items ?? []

  return (
    <MainLayout title="协调审批" subtitle="跨部门派发、调整和后补填报审批">
      <div className="flex h-full flex-col gap-5">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}
        <div className="flex items-center justify-between">
          <Tabs tabs={statusTabs} value={status} onChange={setStatus} />
          <span className="text-sm text-text-muted">{loading ? '加载中...' : `共 ${approvals.length} 条`}</span>
        </div>
        <Panel title="协调单列表" className="overflow-hidden">
          <Table>
            <Thead>
              <Tr><Th>协调单</Th><Th>类型</Th><Th>状态</Th><Th>当前步骤</Th><Th>目标人员</Th><Th>创建时间</Th><Th>操作</Th></Tr>
            </Thead>
            <Tbody>
              {approvals.map((item) => (
                <Tr key={item.id}>
                  <Td className="font-mono text-xs">{item.id}</Td>
                  <Td>{ticketTypeLabel(item.ticket_type)}</Td>
                  <Td><Tag variant={approvalStatusVariant(item.status)}>{approvalStatusLabel(item.status)}</Tag></Td>
                  <Td>{item.current_step ?? 1}</Td>
                  <Td>{item.target_person_ids?.length ?? 0} 人</Td>
                  <Td>{formatDateTime(item.created_at)}</Td>
                  <Td><Link to={`/approvals/${item.id}`} className="text-sm text-text-muted hover:text-text-primary">详情</Link></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!loading && approvals.length === 0 && <EmptyState title="暂无协调单" desc="当前筛选下没有需要处理的协调审批。" />}
        </Panel>
      </div>
    </MainLayout>
  )
}

function loadApproval(id: string) {
  return apiGet<ApprovalDetail>(`/approvals/${id}`)
}

export function ApprovalDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApiData(() => loadApproval(id), [id])
  const [comment, setComment] = useState('')
  const [meetingTopic, setMeetingTopic] = useState('')
  const [meetingConclusion, setMeetingConclusion] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const ticket = data?.ticket
  const steps = data?.steps ?? []

  async function perform(label: string, action: () => Promise<unknown>) {
    setActing(label)
    setMessage(null)
    try {
      await action()
      setMessage(`${label}完成`)
      await reload()
    } finally {
      setActing(null)
    }
  }

  function submitAction(action: 'approve' | 'reject' | 'adjust' | 'escalate') {
    const labelMap = { approve: '审批通过', reject: '审批拒绝', adjust: '调整后通过', escalate: '升级审批' }
    void perform(labelMap[action], () => apiPost(`/approvals/${id}/${action}`, { comment }))
  }

  function saveMeeting() {
    void perform('保存会议记录', () => apiPost(`/approvals/${id}/meeting-records`, {
      meeting_at: new Date().toISOString(),
      topic: meetingTopic,
      conclusion: meetingConclusion,
    }))
  }

  return (
    <MainLayout title="协调审批详情" subtitle={id}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <button className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary" onClick={() => navigate('/approvals')}>
            <ArrowLeft className="h-4 w-4" />返回列表
          </button>
          {ticket?.task_id && <Link to={`/tasks/${ticket.task_id}`} className="text-sm text-text-muted hover:text-text-primary">查看任务</Link>}
        </div>
        {(error || message) && (
          <div className={`rounded-md px-4 py-3 text-sm ${error ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
            {error || message}
          </div>
        )}
        {!loading && !ticket && !error && <EmptyState title="协调单不存在" desc="未找到对应的审批记录。" />}
        {ticket && (
          <div className="grid grid-cols-[1fr_380px] gap-6">
            <div className="flex flex-col gap-6">
              <Panel title="基础信息">
                <div className="grid grid-cols-3 gap-4">
                  <Info label="类型" value={ticketTypeLabel(ticket.ticket_type)} />
                  <Info label="状态" value={<Tag variant={approvalStatusVariant(ticket.status)}>{approvalStatusLabel(ticket.status)}</Tag>} />
                  <Info label="当前步骤" value={String(ticket.current_step ?? 1)} />
                  <Info label="目标人员" value={`${ticket.target_person_ids?.length ?? 0} 人`} />
                  <Info label="目标组织" value={ticket.target_org_id ?? '未设置'} />
                  <Info label="创建时间" value={formatDateTime(ticket.created_at)} />
                </div>
              </Panel>
              <Panel title="审批步骤">
                <Table>
                  <Thead><Tr><Th>步骤</Th><Th>审批来源</Th><Th>审批人</Th><Th>动作</Th><Th>意见</Th><Th>时间</Th></Tr></Thead>
                  <Tbody>
                    {steps.map((step) => (
                      <Tr key={step.id}>
                        <Td>{step.step_order ?? '-'}</Td>
                        <Td><Badge>{step.approver_source ?? 'default'}</Badge></Td>
                        <Td>{step.approver_id ?? '-'}</Td>
                        <Td>{step.action ?? '-'}</Td>
                        <Td>{step.comment || '-'}</Td>
                        <Td>{formatDateTime(step.acted_at)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {steps.length === 0 && <EmptyState title="暂无审批步骤" desc="该协调单还没有步骤记录。" />}
              </Panel>
              <Panel title="冲突与派发预览">
                <pre className="max-h-[340px] overflow-auto rounded-md bg-bg-tertiary p-4 text-xs leading-relaxed text-text-secondary">
                  {JSON.stringify(ticket.payload ?? {}, null, 2)}
                </pre>
              </Panel>
            </div>
            <div className="flex flex-col gap-6">
              <Panel title="审批操作">
                <Input label="审批意见" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="拒绝、调整或升级时必须填写" />
                <div className="grid grid-cols-2 gap-3">
                  <Button className="h-9 px-3 text-sm" disabled={acting !== null || ticket.status !== 'pending'} onClick={() => submitAction('approve')}>通过</Button>
                  <Button variant="danger" className="h-9 px-3 text-sm" disabled={acting !== null || ticket.status !== 'pending'} onClick={() => submitAction('reject')}>拒绝</Button>
                  <Button variant="secondary" className="h-9 px-3 text-sm" disabled={acting !== null || ticket.status !== 'pending'} onClick={() => submitAction('adjust')}>调整后通过</Button>
                  <Button variant="secondary" className="h-9 px-3 text-sm" disabled={acting !== null} onClick={() => submitAction('escalate')}>升级</Button>
                </div>
              </Panel>
              <Panel title="会议记录">
                <Input label="会议主题" value={meetingTopic} onChange={(event) => setMeetingTopic(event.target.value)} />
                <Input label="会议结论" value={meetingConclusion} onChange={(event) => setMeetingConclusion(event.target.value)} />
                <Button className="h-9 px-3 text-sm" disabled={acting !== null || !meetingTopic} onClick={saveMeeting}>
                  <Save className="h-4 w-4" />保存记录
                </Button>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border-subtle p-3">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="break-all text-sm font-medium text-text-primary">{value}</span>
    </div>
  )
}
