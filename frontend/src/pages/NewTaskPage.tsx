import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, Panel, Select, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { type ApiList, type ApiPerson, type ApiProject, accountStatusLabel, formatDate, workStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { AlertTriangle, CheckCircle2, Plus, Save, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const steps = ['基本信息', '负责人和成员', '分工草案', '冲突检查', '确认发布']

const taskTypeOptions = [
  { value: 'research', label: '科研任务' },
  { value: 'report', label: '报告材料' },
  { value: 'support', label: '协同支持' },
  { value: 'travel', label: '出差安排' },
  { value: 'other', label: '其他' },
]

const priorityOptions = [
  { value: 'normal', label: '中' },
  { value: 'low', label: '低' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
]

interface FormState {
  title: string
  type: string
  priority: string
  ownerId: string
  projectId: string
  start: string
  end: string
  description: string
  deliverable: string
}

interface MemberDraft {
  person_id: string
  member_role: string
  work_content: string
  estimated_total_hours: string
  daily_commitment_hours: string
  start_date: string
  due_date: string
}

interface DispatchPreview {
  task_id?: string
  requires_approval?: boolean
  conflicts?: DispatchConflict[]
}

interface DispatchConflict {
  type?: string
  person_id?: string
  target_org_id?: string
  work_status?: string
  preview?: WorkloadPreview
}

interface WorkloadPreview {
  person_id?: string
  start?: string
  end?: string
  days?: WorkloadDay[]
  conflicts?: WorkloadConflict[]
}

interface WorkloadDay {
  date?: string
  existing_hours?: number
  new_hours?: number
  total_hours?: number
  standard_hours?: number
  load_rate?: number
}

interface WorkloadConflict {
  type?: string
  date?: string
  overload_hours?: number
  risk_level?: string
}

async function loadOptions() {
  const [people, projects] = await Promise.all([
    apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }),
    apiGet<ApiList<ApiProject>>('/projects', { page_size: 200 }),
  ])
  return { people: people.items, projects: projects.items }
}

function toRfc3339(date: string) {
  return date ? `${date}T00:00:00Z` : undefined
}

function numberOrZero(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function makeMemberDraft(personId: string, role: string, form: FormState): MemberDraft {
  return {
    person_id: personId,
    member_role: role,
    work_content: role === 'owner' ? '任务总体负责与成果统筹' : '',
    estimated_total_hours: '8',
    daily_commitment_hours: '2',
    start_date: form.start,
    due_date: form.end,
  }
}

function personName(people: ApiPerson[], id?: string) {
  return people.find((person) => person.id === id)?.name ?? id ?? '未选择'
}

export function NewTaskPage() {
  const navigate = useNavigate()
  const { data, loading, error } = useApiData(loadOptions)
  const people = data?.people ?? []
  const projects = data?.projects ?? []
  const [activeStep, setActiveStep] = useState(0)
  const [draftTaskId, setDraftTaskId] = useState<string | null>(null)
  const [preview, setPreview] = useState<DispatchPreview | null>(null)
  const [workloadPreviews, setWorkloadPreviews] = useState<WorkloadPreview[]>([])
  const [createdAssignments, setCreatedAssignments] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [newMemberId, setNewMemberId] = useState('')
  const [form, setForm] = useState<FormState>({
    title: '',
    type: 'research',
    priority: 'normal',
    ownerId: '',
    projectId: '',
    start: '',
    end: '',
    description: '',
    deliverable: '',
  })
  const [members, setMembers] = useState<MemberDraft[]>([])

  const canGoNext =
    activeStep === 0 ? Boolean(form.title && form.start && form.end && form.end >= form.start) :
    activeStep === 1 ? Boolean(form.ownerId && members.length > 0) :
    activeStep === 2 ? members.every((member) => member.start_date && member.due_date && member.due_date >= member.start_date && numberOrZero(member.daily_commitment_hours) > 0) :
    true

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setPreview(null)
    setWorkloadPreviews([])
    if (field === 'start' || field === 'end') {
      setMembers((prev) => prev.map((member) => ({
        ...member,
        start_date: field === 'start' && !member.start_date ? value : member.start_date,
        due_date: field === 'end' && !member.due_date ? value : member.due_date,
      })))
    }
  }

  function selectOwner(ownerId: string) {
    setForm((prev) => ({ ...prev, ownerId }))
    setPreview(null)
    setWorkloadPreviews([])
    if (!ownerId) return
    setMembers((prev) => {
      const withoutPreviousOwner = prev.map((member) => ({
        ...member,
        member_role: member.member_role === 'owner' ? 'member' : member.member_role,
      }))
      const existing = withoutPreviousOwner.find((member) => member.person_id === ownerId)
      if (existing) {
        return withoutPreviousOwner.map((member) => member.person_id === ownerId ? { ...member, member_role: 'owner' } : member)
      }
      return [makeMemberDraft(ownerId, 'owner', form), ...withoutPreviousOwner]
    })
  }

  function addMember() {
    if (!newMemberId) return
    setPreview(null)
    setWorkloadPreviews([])
    setMembers((prev) => prev.concat(makeMemberDraft(newMemberId, 'member', form)))
    setNewMemberId('')
  }

  function removeMember(personId: string) {
    setPreview(null)
    setWorkloadPreviews([])
    setMembers((prev) => prev.filter((member) => member.person_id !== personId))
    if (form.ownerId === personId) setForm((prev) => ({ ...prev, ownerId: '' }))
  }

  function updateMember(personId: string, patch: Partial<MemberDraft>) {
    setPreview(null)
    setWorkloadPreviews([])
    setMembers((prev) => prev.map((member) => member.person_id === personId ? { ...member, ...patch } : member))
  }

  function ownerOrgId() {
    return projects.find((project) => project.id === form.projectId)?.owner_org_id
      ?? people.find((person) => person.id === form.ownerId)?.primary_org_id
      ?? undefined
  }

  function memberEstimatedTotalHours() {
    return members.reduce((sum, member) => sum + numberOrZero(member.estimated_total_hours), 0)
  }

  function taskPayload() {
    return {
      name: form.title,
      sub_type: form.type,
      priority: form.priority,
      owner_org_id: ownerOrgId(),
      owner_id: form.ownerId || undefined,
      project_id: form.projectId || undefined,
      start_at: toRfc3339(form.start),
      due_at: toRfc3339(form.end),
      estimated_total_hours: memberEstimatedTotalHours(),
      summary: form.description,
      deliverable_requirement: form.deliverable,
      status: 'draft',
      members: members.map((member) => ({
        person_id: member.person_id,
        member_role: member.member_role,
        work_content: member.work_content,
        estimated_total_hours: numberOrZero(member.estimated_total_hours),
        daily_commitment_type: 'hours',
        daily_commitment_hours: numberOrZero(member.daily_commitment_hours),
        start_date: member.start_date,
        due_date: member.due_date,
        approval_status: 'pending',
      })),
      payload: {
        owner_name: personName(people, form.ownerId),
        project_name: projects.find((project) => project.id === form.projectId)?.name,
        owner_org_name: projects.find((project) => project.id === form.projectId)?.payload?.owner_org_name
          ?? people.find((person) => person.id === form.ownerId)?.primary_org_name,
      },
    }
  }

  async function saveAssignments(taskId: string) {
    const remainingAssignmentKeys = new Set(members.map((member) => member.person_id))
    setCreatedAssignments((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => remainingAssignmentKeys.has(key))))

    for (const member of members) {
      const title = member.work_content.trim() || `${personName(people, member.person_id)}分工`
      const assignmentPayload = {
        title,
        owner_id: member.person_id,
        collaborator_ids: member.member_role === 'owner'
          ? members.filter((item) => item.person_id !== member.person_id).map((item) => item.person_id)
          : [form.ownerId].filter(Boolean),
        start_date: member.start_date,
        due_date: member.due_date,
        estimated_total_hours: numberOrZero(member.estimated_total_hours),
        daily_commitment_type: 'hours',
        daily_commitment_hours: numberOrZero(member.daily_commitment_hours),
        payload: {
          draft_key: member.person_id,
          source: 'new_task_wizard',
          work_content: member.work_content,
          member_role: member.member_role,
        },
      }
      const assignmentId = createdAssignments[member.person_id]
      if (assignmentId) {
        await apiPatch(`/assignments/${assignmentId}`, assignmentPayload)
      } else {
        const res = await apiPost<{ id: string }>(`/tasks/${taskId}/assignments`, assignmentPayload)
        setCreatedAssignments((prev) => ({ ...prev, [member.person_id]: res.id }))
      }
    }
  }

  async function saveDraft() {
    setActing('save')
    setSubmitError(null)
    try {
      if (draftTaskId) {
        await apiPatch(`/tasks/${draftTaskId}`, taskPayload())
        return draftTaskId
      }
      const res = await apiPost<{ id: string }>('/tasks', taskPayload())
      setDraftTaskId(res.id)
      return res.id
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '保存草稿失败')
      throw err
    } finally {
      setActing(null)
    }
  }

  async function runPreview() {
    setActing('preview')
    setSubmitError(null)
    try {
      const taskId = await saveDraft()
      const [res, loads] = await Promise.all([
        apiPost<DispatchPreview>('/dispatch/preview', { task_id: taskId }),
        Promise.all(members.map((member) => apiPost<WorkloadPreview>('/workload/preview', {
          person_id: member.person_id,
          start_date: member.start_date,
          due_date: member.due_date,
          daily_commitment_type: 'hours',
          daily_commitment_hours: numberOrZero(member.daily_commitment_hours),
        }))),
      ])
      setPreview(res)
      setWorkloadPreviews(loads)
      setActiveStep(3)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '冲突检查失败')
    } finally {
      setActing(null)
    }
  }

  async function submitDispatch() {
    setActing('dispatch')
    setSubmitError(null)
    try {
      const taskId = await saveDraft()
      await saveAssignments(taskId)
      await apiPost('/dispatch/submit', { task_id: taskId, reason: preview?.requires_approval ? '向导提交协调' : '向导直接发布' })
      navigate(`/tasks/${taskId}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交派发失败')
    } finally {
      setActing(null)
    }
  }

  function handleNext(event?: FormEvent) {
    event?.preventDefault()
    if (!canGoNext) return
    if (activeStep === 2) {
      void runPreview()
      return
    }
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  return (
    <MainLayout title="新建任务" subtitle="按派发向导完成负责人、分工和冲突检查">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <StepHeader activeStep={activeStep} />

        {(error || submitError) && (
          <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">
            {error || submitError}
          </div>
        )}

        <form onSubmit={handleNext} className="flex flex-col gap-6">
          {(() => {
            const footer = (
              <StepActions
                activeStep={activeStep}
                canGoNext={canGoNext}
                acting={acting}
                draftTaskId={draftTaskId}
                preview={preview}
                saveDraft={saveDraft}
                submitDispatch={submitDispatch}
                setActiveStep={setActiveStep}
              />
            )
            return (
              <>
                {activeStep === 0 && <BasicStep form={form} loading={loading} projects={projects} updateField={updateField} footer={footer} />}
                {activeStep === 1 && (
                  <PeopleStep
                    form={form}
                    people={people}
                    members={members}
                    newMemberId={newMemberId}
                    setNewMemberId={setNewMemberId}
                    selectOwner={selectOwner}
                    addMember={addMember}
                    removeMember={removeMember}
                    footer={footer}
                  />
                )}
                {activeStep === 2 && <DivisionStep people={people} members={members} updateMember={updateMember} removeMember={removeMember} footer={footer} />}
                {activeStep === 3 && <PreviewStep preview={preview} workloadPreviews={workloadPreviews} people={people} draftTaskId={draftTaskId} runPreview={runPreview} acting={acting} footer={footer} />}
                {activeStep === 4 && <ConfirmStep form={form} people={people} projects={projects} members={members} preview={preview} workloadPreviews={workloadPreviews} footer={footer} />}
              </>
            )
          })()}
        </form>
      </div>
    </MainLayout>
  )
}

function StepHeader({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 overflow-x-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 text-sm">
      {steps.map((label, index) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium ${index === activeStep ? 'bg-primary-fill text-primary-text' : index < activeStep ? 'bg-color-success-bg text-color-success' : 'bg-bg-tertiary text-text-muted'}`}>
            <span>{index + 1}</span>
            <span>{label}</span>
          </div>
          {index < steps.length - 1 && <span className="text-text-muted">&gt;</span>}
        </div>
      ))}
    </div>
  )
}

function StepActions({
  activeStep,
  canGoNext,
  acting,
  draftTaskId,
  preview,
  saveDraft,
  submitDispatch,
  setActiveStep,
}: {
  activeStep: number
  canGoNext: boolean
  acting: string | null
  draftTaskId: string | null
  preview: DispatchPreview | null
  saveDraft: () => Promise<string | undefined>
  submitDispatch: () => Promise<void>
  setActiveStep: (step: number) => void
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Link to="/tasks">
        <Button type="button" variant="ghost" className="h-9 px-4 text-sm">取消</Button>
      </Link>
      {activeStep > 0 && (
        <Button type="button" variant="ghost" className="h-9 px-4 text-sm" disabled={acting !== null} onClick={() => setActiveStep(Math.max(activeStep - 1, 0))}>
          上一步
        </Button>
      )}
      {activeStep < 4 && (
        <Button className="h-9 px-4 text-sm" disabled={!canGoNext || acting !== null}>
          {activeStep === 2 ? '保存并检查' : '下一步'}
        </Button>
      )}
      {activeStep >= 3 && activeStep !== 4 && (
        <Button type="button" variant="secondary" className="h-9 px-4 text-sm" disabled={acting !== null || !draftTaskId || !preview} onClick={() => setActiveStep(4)}>
          进入确认发布
        </Button>
      )}
      <Button type="button" variant="secondary" className="h-9 px-4 text-sm" disabled={acting !== null || !canGoNext} onClick={() => void saveDraft().then((id) => id && navigate(`/tasks/${id}`))}>
        <Save className="h-4 w-4" />保存草稿
      </Button>
      {activeStep === 4 && (
        <Button type="button" className="h-9 px-4 text-sm" disabled={acting !== null || !draftTaskId || !preview} onClick={() => void submitDispatch()}>
          <Send className="h-4 w-4" />{preview?.requires_approval ? '提交协调' : '直接发布'}
        </Button>
      )}
    </div>
  )
}

function BasicStep({ form, loading, projects, updateField, footer }: { form: FormState; loading: boolean; projects: ApiProject[]; updateField: (field: keyof FormState, value: string) => void; footer?: React.ReactNode }) {
  const projectOptions = [{ value: '', label: loading ? '项目加载中' : '不关联项目' }].concat(projects.map((project) => ({ value: project.id, label: project.name })))
  return (
    <Panel title="基本信息" footer={footer}>
      <Input label="任务标题" placeholder="请输入任务标题" value={form.title} onChange={(event) => updateField('title', event.target.value)} required />
      <div className="grid grid-cols-2 gap-5">
        <Select label="任务类型" options={taskTypeOptions} value={form.type} onChange={(event) => updateField('type', event.target.value)} />
        <Select label="优先级" options={priorityOptions} value={form.priority} onChange={(event) => updateField('priority', event.target.value)} />
      </div>
      <Select label="所属项目" options={projectOptions} value={form.projectId} onChange={(event) => updateField('projectId', event.target.value)} />
      <div className="grid grid-cols-2 gap-5">
        <Input label="开始时间" type="date" value={form.start} onChange={(event) => updateField('start', event.target.value)} required />
        <Input label="截止时间" type="date" value={form.end} onChange={(event) => updateField('end', event.target.value)} required />
      </div>
      {form.start && form.end && form.end < form.start && <p className="text-sm text-color-error">截止时间不能早于开始时间。</p>}
      <Textarea label="任务描述" value={form.description} onChange={(value) => updateField('description', value)} rows={4} />
      <Textarea label="交付要求" value={form.deliverable} onChange={(value) => updateField('deliverable', value)} rows={3} />
    </Panel>
  )
}

function PeopleStep({ form, people, members, newMemberId, setNewMemberId, selectOwner, addMember, removeMember, footer }: {
  form: FormState
  people: ApiPerson[]
  members: MemberDraft[]
  newMemberId: string
  setNewMemberId: (value: string) => void
  selectOwner: (value: string) => void
  addMember: () => void
  removeMember: (value: string) => void
  footer?: ReactNode
}) {
  const selectedIds = members.map((member) => member.person_id)
  const ownerOptions = [{ value: '', label: '请选择负责人' }].concat(people.map((person) => ({ value: person.id, label: `${person.name} · ${workStatusLabel(person.work_status)}` })))
  const addOptions = [{ value: '', label: '选择成员' }].concat(people.filter((person) => !selectedIds.includes(person.id)).map((person) => ({ value: person.id, label: person.name })))
  return (
    <Panel title="负责人和成员" footer={footer}>
      <Select label="负责人" value={form.ownerId} onChange={(event) => selectOwner(event.target.value)} options={ownerOptions} required />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Select label="添加成员" value={newMemberId} onChange={(event) => setNewMemberId(event.target.value)} options={addOptions} />
        <Button type="button" variant="secondary" className="mt-7 h-[42px] px-4" disabled={!newMemberId} onClick={addMember}>
          <Plus className="h-4 w-4" />添加
        </Button>
      </div>
      <Table>
        <Thead><Tr><Th>姓名</Th><Th>状态</Th><Th>账号</Th><Th>角色</Th><Th>操作</Th></Tr></Thead>
        <Tbody>
          {members.map((member) => {
            const person = people.find((item) => item.id === member.person_id)
            return (
              <Tr key={member.person_id}>
                <Td>{person?.name ?? member.person_id}</Td>
                <Td>{workStatusLabel(person?.work_status)}</Td>
                <Td><Tag variant={person?.account_status === 'enabled' ? 'success' : 'warning'}>{accountStatusLabel(person?.account_status)}</Tag></Td>
                <Td><Badge>{member.member_role === 'owner' ? '负责人' : '成员'}</Badge></Td>
                <Td>
                  <Button type="button" variant="ghost" className="h-8 px-2 text-sm" onClick={() => removeMember(member.person_id)}>
                    <Trash2 className="h-4 w-4" />移除
                  </Button>
                </Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>
      {members.length === 0 && <EmptyState title="暂无成员" desc="请选择负责人，负责人会自动加入成员列表。" />}
    </Panel>
  )
}

function DivisionStep({ people, members, updateMember, removeMember, footer }: { people: ApiPerson[]; members: MemberDraft[]; updateMember: (id: string, patch: Partial<MemberDraft>) => void; removeMember: (id: string) => void; footer?: ReactNode }) {
  return (
    <Panel title="分工草案" footer={footer}>
      <Table>
        <Thead><Tr><Th>成员</Th><Th>工作内容</Th><Th>起止时间</Th><Th>总工时</Th><Th>每日投入</Th><Th>操作</Th></Tr></Thead>
        <Tbody>
          {members.map((member) => (
            <Tr key={member.person_id}>
              <Td>{personName(people, member.person_id)}</Td>
              <Td>
                <Input value={member.work_content} onChange={(event) => updateMember(member.person_id, { work_content: event.target.value })} placeholder="填写分工内容" />
              </Td>
              <Td>
                <div className="grid min-w-[220px] grid-cols-2 gap-2">
                  <Input type="date" value={member.start_date} onChange={(event) => updateMember(member.person_id, { start_date: event.target.value })} />
                  <Input type="date" value={member.due_date} onChange={(event) => updateMember(member.person_id, { due_date: event.target.value })} />
                </div>
              </Td>
              <Td><Input type="number" min={0} value={member.estimated_total_hours} onChange={(event) => updateMember(member.person_id, { estimated_total_hours: event.target.value })} /></Td>
              <Td><Input type="number" min={0.5} step={0.5} value={member.daily_commitment_hours} onChange={(event) => updateMember(member.person_id, { daily_commitment_hours: event.target.value })} /></Td>
              <Td>
                <Button type="button" variant="ghost" className="h-8 px-2 text-sm" onClick={() => removeMember(member.person_id)}>移除</Button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {members.length === 0 && <EmptyState title="暂无分工" desc="先选择负责人和成员，再填写分工草案。" />}
    </Panel>
  )
}

function PreviewStep({
  preview,
  workloadPreviews,
  people,
  draftTaskId,
  runPreview,
  acting,
  footer,
}: {
  preview: DispatchPreview | null
  workloadPreviews: WorkloadPreview[]
  people: ApiPerson[]
  draftTaskId: string | null
  runPreview: () => Promise<void>
  acting: string | null
  footer?: ReactNode
}) {
  const conflicts = preview?.conflicts ?? []
  const workloadConflicts = workloadPreviews.flatMap((item) => item.conflicts ?? [])
  return (
    <Panel title="冲突检查" footer={footer}>
      <div className="grid grid-cols-3 gap-4">
        <Metric label="草稿任务" value={draftTaskId ? '已保存' : '未保存'} ok={Boolean(draftTaskId)} />
        <Metric label="协调审批" value={preview?.requires_approval ? '需要' : '不需要'} ok={!preview?.requires_approval} />
        <Metric label="风险项" value={`${conflicts.length + workloadConflicts.length} 项`} ok={conflicts.length === 0 && workloadConflicts.length === 0} />
      </div>
      <div className="flex items-center gap-2 rounded-md bg-bg-tertiary px-4 py-3 text-sm text-text-muted">
        {preview?.requires_approval ? <AlertTriangle className="h-4 w-4 text-color-warning" /> : <CheckCircle2 className="h-4 w-4 text-color-success" />}
        <span>{preview?.requires_approval ? '当前派发需要协调审批，确认发布时会创建协调单。' : '当前派发可直接进入确认发布。'}</span>
      </div>
      {conflicts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {conflicts.map((conflict, index) => (
            <ConflictRow key={index} conflict={conflict} people={people} />
          ))}
        </div>
      ) : (
        <EmptyState title="未发现阻断项" desc="仍可返回前序步骤调整人员、时间或投入。" />
      )}
      {workloadPreviews.length > 0 && (
        <Table>
          <Thead><Tr><Th>成员</Th><Th>周期</Th><Th>峰值负载</Th><Th>负载风险</Th></Tr></Thead>
          <Tbody>
            {workloadPreviews.map((item) => {
              const peak = Math.max(...(item.days ?? []).map((day) => day.load_rate ?? 0), 0)
              return (
                <Tr key={item.person_id}>
                  <Td>{personName(people, item.person_id)}</Td>
                  <Td>{formatDate(item.start)} - {formatDate(item.end)}</Td>
                  <Td>{Math.round(peak * 100)}%</Td>
                  <Td>
                    {(item.conflicts ?? []).length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {(item.conflicts ?? []).slice(0, 3).map((conflict, index) => (
                          <span key={index} className="text-sm text-color-warning">
                            {workloadConflictLabel(conflict)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <Tag variant="success">正常</Tag>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}
      <Button type="button" variant="secondary" className="h-9 px-3 text-sm" disabled={acting !== null} onClick={() => void runPreview()}>
        重新检查
      </Button>
    </Panel>
  )
}

function ConflictRow({ conflict, people }: { conflict: DispatchConflict; people: ApiPerson[] }) {
  const name = personName(people, conflict.person_id)
  if (conflict.type === 'cross_department') {
    return <RiskBox title="跨部门派发" desc={`${name} 所属组织与任务归属组织不同，发布后会进入协调审批。`} />
  }
  if (conflict.type === 'person_unavailable') {
    return <RiskBox title="人员不可派发" desc={`${name} 当前状态为 ${workStatusLabel(conflict.work_status)}，需要协调后派发。`} />
  }
  if (conflict.type === 'workload_conflict') {
    const count = conflict.preview?.conflicts?.length ?? 0
    return <RiskBox title="负载冲突" desc={`${name} 在任务周期内有 ${count} 个负载风险日期。`} />
  }
  return <RiskBox title="派发风险" desc={`${name} 存在需要协调确认的派发风险。`} />
}

function RiskBox({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-md border border-color-warning bg-color-warning-bg px-4 py-3">
      <div className="text-sm font-semibold text-color-warning">{title}</div>
      <div className="mt-1 text-sm text-text-secondary">{desc}</div>
    </div>
  )
}

function workloadConflictLabel(conflict: WorkloadConflict) {
  if (conflict.type === 'overload') {
    return `${formatDate(conflict.date)} 超载 ${Number(conflict.overload_hours ?? 0).toFixed(1)} 小时`
  }
  if (conflict.type === 'full_day_overlap') {
    return `${formatDate(conflict.date)} 全天任务重叠`
  }
  return `${formatDate(conflict.date)} 存在负载风险`
}

function ConfirmStep({ form, people, projects, members, preview, workloadPreviews, footer }: { form: FormState; people: ApiPerson[]; projects: ApiProject[]; members: MemberDraft[]; preview: DispatchPreview | null; workloadPreviews: WorkloadPreview[]; footer?: ReactNode }) {
  const workloadConflictCount = workloadPreviews.reduce((sum, item) => sum + (item.conflicts?.length ?? 0), 0)
  return (
    <Panel title="确认发布" footer={footer}>
      <div className="grid grid-cols-2 gap-4">
        <InfoBox label="任务名称" value={form.title} />
        <InfoBox label="任务周期" value={`${formatDate(form.start)} - ${formatDate(form.end)}`} />
        <InfoBox label="负责人" value={personName(people, form.ownerId)} />
        <InfoBox label="关联项目" value={projects.find((project) => project.id === form.projectId)?.name ?? '未关联'} />
        <InfoBox label="成员数量" value={`${members.length} 人`} />
        <InfoBox label="预计总工时" value={`${members.reduce((sum, member) => sum + numberOrZero(member.estimated_total_hours), 0)} 小时`} />
        <InfoBox label="负载风险" value={`${workloadConflictCount} 项`} />
        <InfoBox label="发布动作" value={preview?.requires_approval ? '提交协调' : '直接发布'} />
      </div>
      <div className="rounded-md bg-bg-tertiary px-4 py-3 text-sm text-text-muted">
        发布后会基于当前草稿创建派发记录；如存在跨部门、人员状态或负载问题，会进入协调审批。
      </div>
    </Panel>
  )
}

function Textarea({ label, value, rows, onChange }: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-text-muted">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary transition-fast placeholder:text-text-placeholder focus:border-text-muted focus:outline-none"
      />
    </div>
  )
}

function Metric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-border-subtle p-4">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-base font-semibold text-text-primary">{value}</span>
        <Tag variant={ok ? 'success' : 'warning'}>{ok ? '正常' : '注意'}</Tag>
      </div>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle p-4">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="mt-2 text-base font-medium text-text-primary">{value}</div>
    </div>
  )
}
