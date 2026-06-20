import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiTodo, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApiData } from '@/lib/useApiData'
import { AlertTriangle, Check, CheckCheck, ExternalLink, Inbox, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

type FilterKey = 'open' | 'today' | 'overdue' | 'completed' | 'all'

const filters: { value: FilterKey; label: string }[] = [
  { value: 'open', label: '待处理' },
  { value: 'today', label: '今日到期' },
  { value: 'overdue', label: '逾期' },
  { value: 'completed', label: '已完成' },
  { value: 'all', label: '全部' },
]

function todoTypeLabel(type?: string) {
  const map: Record<string, string> = {
    approval: '审批',
    task: '任务',
    resource: '资料',
    conflict: '冲突',
    registration: '注册审核',
  }
  return map[type ?? ''] ?? type ?? '待办'
}

function normalizeActionUrl(url?: string | null) {
  if (!url) return '/tasks'
  const taskMatch = url.match(/^\/tasks\/([^/?#]+)/)
  if (taskMatch?.[1]) return `/tasks?task=${encodeURIComponent(taskMatch[1])}`
  return url.startsWith('/') ? url : '/tasks'
}

function loadTodos() {
  return apiGet<ApiList<ApiTodo>>('/todos', { page_size: 100 })
}

function dateValue(value?: string | null) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : new Date(time)
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function isDueToday(todo: ApiTodo) {
  const due = dateValue(todo.due_at)
  if (!due) return false
  const today = startOfToday()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  return due >= today && due < tomorrow
}

function isOverdue(todo: ApiTodo) {
  const due = dateValue(todo.due_at)
  if (!due || todo.status === 'completed') return false
  return due < startOfToday()
}

function payloadSummary(todo: ApiTodo) {
  const text = JSON.stringify(todo.payload ?? {}, null, 2)
  if (text.length <= 520) return text
  return `${text.slice(0, 520)}\n...`
}

function completionReason(todo?: ApiTodo | null) {
  const value = todo?.payload?.completion_reason
  return typeof value === 'string' && value.trim() ? value : ''
}

export function TodoCenterPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('open')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [completionTarget, setCompletionTarget] = useState<{ mode: 'single' | 'bulk'; ids: string[] } | null>(null)
  const [completionReasonText, setCompletionReasonText] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(loadTodos)
  const todos = useMemo(() => data?.items ?? [], [data?.items])
  const selectedTodoId = params.get('todo')

  const stats = useMemo(() => {
    const open = todos.filter((todo) => todo.status !== 'completed')
    return {
      all: todos.length,
      open: open.length,
      today: open.filter(isDueToday).length,
      overdue: open.filter(isOverdue).length,
      completed: todos.length - open.length,
    }
  }, [todos])

  const filteredTodos = useMemo(() => {
    if (activeFilter === 'completed') return todos.filter((todo) => todo.status === 'completed')
    if (activeFilter === 'today') return todos.filter((todo) => todo.status !== 'completed' && isDueToday(todo))
    if (activeFilter === 'overdue') return todos.filter((todo) => todo.status !== 'completed' && isOverdue(todo))
    if (activeFilter === 'open') return todos.filter((todo) => todo.status !== 'completed')
    return todos
  }, [activeFilter, todos])

  const activeTodo = useMemo(
    () => filteredTodos.find((todo) => todo.id === selectedTodoId) ?? filteredTodos[0] ?? null,
    [filteredTodos, selectedTodoId]
  )
  const selectedTodos = useMemo(() => filteredTodos.filter((todo) => selectedIds.includes(todo.id)), [filteredTodos, selectedIds])
  const selectedOpenTodos = selectedTodos.filter((todo) => todo.status !== 'completed')
  const selectedOverdueCount = selectedOpenTodos.filter(isOverdue).length
  const allVisibleSelected = filteredTodos.length > 0 && filteredTodos.every((todo) => selectedIds.includes(todo.id))

  function applyFilter(filter: FilterKey) {
    setActiveFilter(filter)
    setSelectedIds([])
    setMessage(null)
  }

  function selectTodo(id: string) {
    const next = new URLSearchParams(params)
    next.set('todo', id)
    setParams(next)
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.concat(id))
  }

  function toggleAllVisible() {
    const visibleIds = filteredTodos.map((todo) => todo.id)
    setSelectedIds((current) => {
      if (visibleIds.length > 0 && visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id))
      }
      return Array.from(new Set(current.concat(visibleIds)))
    })
  }

  function openTodoAction(todo: ApiTodo) {
    navigate(normalizeActionUrl(todo.action_url))
  }

  function openCompletion(mode: 'single' | 'bulk', ids: string[]) {
    const openIds = ids.filter((id) => todos.some((todo) => todo.id === id && todo.status !== 'completed'))
    if (openIds.length === 0) {
      setMessage({ type: 'info', text: '当前选择中没有待处理事项' })
      return
    }
    setCompletionTarget({ mode, ids: openIds })
    setCompletionReasonText('')
    setMessage(null)
  }

  function closeCompletion() {
    setCompletionTarget(null)
    setCompletionReasonText('')
  }

  async function submitCompletion() {
    if (!completionTarget) return
    if (!completionReasonText.trim()) {
      setMessage({ type: 'error', text: '请填写完成原因' })
      return
    }
    setActing('complete')
    setMessage(null)
    const failures: string[] = []
    for (const id of completionTarget.ids) {
      const todo = todos.find((item) => item.id === id)
      try {
        await apiPost(`/todos/${id}/complete`, { completion_reason: completionReasonText.trim() })
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `${todo?.title ?? id} 完成失败`)
      }
    }
    setActing(null)
    if (failures.length > 0) {
      setMessage({ type: 'error', text: `${failures.length} 条待办完成失败：${failures[0]}` })
      return
    }
    await reload()
    setSelectedIds((current) => current.filter((id) => !completionTarget.ids.includes(id)))
    setMessage({ type: 'success', text: `${completionTarget.ids.length} 条待办已完成` })
    closeCompletion()
  }

  return (
    <MainLayout title="收件箱" subtitle={`待处理 ${stats.open} 条，今日到期 ${stats.today} 条，逾期 ${stats.overdue} 条`}>
      <div className="flex h-full min-h-0 flex-col gap-5">
        {(error || message) && (
          <div
            className={cn(
              'rounded-md px-4 py-3 text-sm',
              error || message?.type === 'error'
                ? 'bg-color-error-bg text-color-error'
                : message?.type === 'info'
                  ? 'bg-color-info-bg text-color-info'
                  : 'bg-color-success-bg text-color-success'
            )}
          >
            {error || message?.text}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <MetricButton active={activeFilter === 'open'} label="待处理" value={stats.open} sub="可批量完成" onClick={() => applyFilter('open')} />
          <MetricButton active={activeFilter === 'today'} label="今日到期" value={stats.today} sub="需优先处理" onClick={() => applyFilter('today')} />
          <MetricButton active={activeFilter === 'overdue'} label="逾期" value={stats.overdue} sub="完成需说明" danger onClick={() => applyFilter('overdue')} />
          <MetricButton active={activeFilter === 'completed'} label="已完成" value={stats.completed} sub="查看处理记录" onClick={() => applyFilter('completed')} />
        </div>

        <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel
            className="min-h-0 overflow-hidden"
            title="待办处理队列"
            right={(
              <Button
                className="h-8 px-3 text-sm"
                disabled={selectedOpenTodos.length === 0}
                onClick={() => openCompletion('bulk', selectedOpenTodos.map((todo) => todo.id))}
              >
                <CheckCheck className="h-4 w-4" />
                批量完成
              </Button>
            )}
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={cn(
                      'h-8 rounded-md px-3 text-sm transition-fast',
                      activeFilter === filter.value ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg hover:text-text-primary'
                    )}
                    onClick={() => applyFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="text-xs text-text-muted">{loading ? '加载中...' : `当前 ${filteredTodos.length} 条`}</div>
            </div>

            {selectedTodos.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-text-primary bg-bg-tertiary px-4 py-3">
                <label className="flex items-center gap-3 text-sm text-text-primary">
                  <input type="checkbox" className="h-4 w-4 accent-black" checked onChange={() => setSelectedIds([])} />
                  <span className="font-semibold">已选 {selectedTodos.length} 条</span>
                  <span className="text-text-muted">待处理 {selectedOpenTodos.length} 条</span>
                  <span className="text-color-error">逾期 {selectedOverdueCount} 条</span>
                </label>
                <div className="flex items-center gap-2">
                  <Button className="h-8 px-3 text-sm" disabled={selectedOpenTodos.length === 0} onClick={() => openCompletion('bulk', selectedOpenTodos.map((todo) => todo.id))}>
                    <CheckCheck className="h-4 w-4" />
                    批量完成
                  </Button>
                  <Button variant="ghost" className="h-8 px-3 text-sm" onClick={() => setSelectedIds([])}>
                    清空选择
                  </Button>
                </div>
              </div>
            )}

            {filteredTodos.length > 0 && (
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <input type="checkbox" className="h-4 w-4 accent-black" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  选择当前筛选下 {filteredTodos.length} 条
                </label>
                <span className="text-xs text-text-muted">完成失败时会保留选择和原因。</span>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {filteredTodos.map((todo) => {
                const active = activeTodo?.id === todo.id
                const selected = selectedIds.includes(todo.id)
                const overdue = isOverdue(todo)
                return (
                  <div
                    key={todo.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 border-b border-border-subtle bg-bg-secondary px-4 py-4 text-left transition-fast',
                      todo.status !== 'completed' && 'border-l-4 border-l-color-info',
                      overdue && 'border-l-color-error bg-color-error-bg/40',
                      selected && 'bg-bg-tertiary',
                      active && 'ring-2 ring-inset ring-primary-fill',
                      !active && 'hover:bg-hover-bg'
                    )}
                    onClick={() => selectTodo(todo.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') selectTodo(todo.id)
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-black"
                      checked={selected}
                      aria-label={`选择待办 ${todo.title}`}
                      onChange={() => toggleSelected(todo.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <TodoIcon todo={todo} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={cn('truncate text-sm text-text-primary', todo.status !== 'completed' ? 'font-bold' : 'font-medium')}>
                          {todo.title}
                        </h3>
                        <Tag variant={todo.status === 'completed' ? 'success' : overdue ? 'error' : isDueToday(todo) ? 'warning' : 'info'}>
                          {todo.status === 'completed' ? '已完成' : overdue ? '逾期' : isDueToday(todo) ? '今日到期' : '待处理'}
                        </Tag>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <Badge>{todoTypeLabel(todo.todo_type)}</Badge>
                        <span>创建 {formatDateTime(todo.created_at)}</span>
                        <span>{todo.due_at ? `截止 ${formatDateTime(todo.due_at)}` : '无截止时间'}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="secondary"
                        className="h-8 px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          openTodoAction(todo)
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                        打开
                      </Button>
                      {todo.status !== 'completed' && (
                        <Button
                          className="h-8 px-2 text-xs"
                          onClick={(event) => {
                            event.stopPropagation()
                            openCompletion('single', [todo.id])
                          }}
                        >
                          <Check className="h-4 w-4" />
                          完成
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
              {!loading && filteredTodos.length === 0 && <EmptyState title="暂无待办" desc={activeFilter === 'open' || activeFilter === 'today' || activeFilter === 'overdue' ? '当前筛选下没有待处理事项。' : '当前筛选下没有待办记录。'} />}
            </div>
          </Panel>

          <TodoPreview
            todo={activeTodo}
            onOpen={openTodoAction}
            onComplete={(todo) => openCompletion('single', [todo.id])}
          />
        </div>

        {completionTarget && (
          <CompletionDialog
            count={completionTarget.ids.length}
            mode={completionTarget.mode}
            value={completionReasonText}
            acting={acting === 'complete'}
            onChange={setCompletionReasonText}
            onClose={closeCompletion}
            onSubmit={() => void submitCompletion()}
          />
        )}
      </div>
    </MainLayout>
  )
}

function MetricButton({ active, danger, label, value, sub, onClick }: { active: boolean; danger?: boolean; label: string; value: number; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="text-left" onClick={onClick}>
      <div className={cn('flex min-h-[92px] flex-col justify-center gap-1.5 rounded-md border bg-bg-secondary p-4 transition-fast hover:bg-hover-bg', active ? 'border-text-primary' : danger ? 'border-color-error' : 'border-border-subtle')}>
        <span className="text-sm font-medium text-text-muted">{label}</span>
        <span className={cn('text-stat font-bold', danger ? 'text-color-error' : 'text-text-primary')}>{value}</span>
        <span className="text-xs text-text-muted">{sub}</span>
      </div>
    </button>
  )
}

function TodoIcon({ todo }: { todo: ApiTodo }) {
  const overdue = isOverdue(todo)
  return (
    <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-tertiary text-text-muted', overdue && 'bg-color-error-bg text-color-error')}>
      {overdue ? <AlertTriangle className="h-4 w-4" /> : todo.status === 'completed' ? <Check className="h-4 w-4" /> : <Inbox className="h-4 w-4" />}
    </div>
  )
}

function TodoPreview({ todo, onOpen, onComplete }: { todo: ApiTodo | null; onOpen: (todo: ApiTodo) => void; onComplete: (todo: ApiTodo) => void }) {
  if (!todo) {
    return (
      <Panel title="待办详情" className="min-h-0">
        <EmptyState title="选择一个待办" desc="查看上下文、截止状态和处理动作。" />
      </Panel>
    )
  }
  const overdue = isOverdue(todo)
  const reason = completionReason(todo)
  return (
    <Panel
      title="待办详情"
      className="min-h-0"
      right={<Tag variant={todo.status === 'completed' ? 'success' : overdue ? 'error' : 'warning'}>{todo.status === 'completed' ? '已完成' : overdue ? '逾期' : '待处理'}</Tag>}
      footer={(
        <div className="flex justify-end gap-2">
          {todo.status !== 'completed' && (
            <Button onClick={() => onComplete(todo)}>
              <Check className="h-4 w-4" />
              完成待办
            </Button>
          )}
          <Button variant="secondary" onClick={() => onOpen(todo)}>
            <ExternalLink className="h-4 w-4" />
            打开处理页
          </Button>
        </div>
      )}
    >
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div className="flex items-start gap-3">
          <TodoIcon todo={todo} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{todoTypeLabel(todo.todo_type)}</Badge>
              {isDueToday(todo) && todo.status !== 'completed' && <Tag variant="warning">今日到期</Tag>}
              {overdue && <Tag variant="error">已逾期</Tag>}
            </div>
            <h3 className="mt-3 text-xl font-semibold leading-tight text-text-primary">{todo.title}</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {todo.status === 'completed' ? '该待办已完成，下面展示完成原因和原始上下文。' : '处理前请确认关联对象状态；完成待办会把原因写入 payload，便于后续追溯。'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PreviewInfo label="创建时间" value={formatDateTime(todo.created_at)} />
          <PreviewInfo label="截止时间" value={todo.due_at ? formatDateTime(todo.due_at) : '无截止时间'} />
          <PreviewInfo label="目标对象" value={`${todo.target_type ?? '未知'}${todo.target_id ? ` / ${todo.target_id}` : ''}`} />
          <PreviewInfo label="处理入口" value={todo.action_url || '默认任务中心'} />
        </div>

        <div className={cn('rounded-md p-4 text-sm leading-6', reason ? 'bg-color-success-bg text-color-success' : 'bg-bg-tertiary text-text-secondary')}>
          <span className="font-semibold">完成原因：</span>{reason || '尚未完成或未填写。'}
        </div>

        <div className="rounded-md bg-bg-tertiary p-4">
          <div className="mb-2 text-sm font-semibold text-text-primary">Payload 摘要</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-bg-secondary p-3 text-xs leading-5 text-text-secondary">{payloadSummary(todo)}</pre>
        </div>
      </div>
    </Panel>
  )
}

function PreviewInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-bg-tertiary p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}

function CompletionDialog({ count, mode, value, acting, onChange, onClose, onSubmit }: {
  count: number
  mode: 'single' | 'bulk'
  value: string
  acting: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-[560px] rounded-lg border border-border-subtle bg-bg-primary p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{mode === 'bulk' ? `批量完成 ${count} 条待办` : '完成待办'}</h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              完成原因会写入待办 payload；如果部分处理失败，将保留当前选择和原因。
            </p>
          </div>
          <Button variant="ghost" className="h-8 w-8 px-0" onClick={onClose} aria-label="关闭完成确认">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
          完成原因
          <textarea
            className="min-h-32 rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary focus:border-text-muted focus:outline-none"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="说明处理结论、补充资料、审批沟通或后续责任人"
          />
        </label>
        <div className="mt-4 rounded-md bg-color-info-bg px-4 py-3 text-sm leading-6 text-color-info">
          将顺序调用现有完成接口；完成后刷新列表，已完成项会从待处理、逾期和今日到期筛选中移出。
        </div>
        <div className="mt-5 flex justify-end gap-3 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" className="h-10 px-4" onClick={onClose}>取消</Button>
          <Button type="button" className="h-10 px-4" disabled={acting} onClick={onSubmit}>
            {acting ? '处理中...' : '确认完成'}
          </Button>
        </div>
      </div>
    </div>
  )
}
