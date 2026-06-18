import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, Tabs, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiTodo, formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const tabs = [
  { value: 'open', label: '待处理' },
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

function statusLabel(status?: string) {
  return status === 'completed' ? '已完成' : '待处理'
}

function normalizeActionUrl(url?: string | null) {
  if (!url) return '/tasks'
  const taskMatch = url.match(/^\/tasks\/([^/?#]+)/)
  if (taskMatch?.[1]) return `/tasks?task=${encodeURIComponent(taskMatch[1])}`
  return url.startsWith('/') ? url : '/tasks'
}

function loadTodos(status: string) {
  return apiGet<ApiList<ApiTodo>>('/todos', {
    status: status === 'all' ? undefined : status,
    page_size: 100,
  })
}

export function TodoCenterPage() {
  const [status, setStatus] = useState('open')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(() => loadTodos(status), [status])
  const todos = data?.items ?? []
  const selectedTodoId = params.get('todo')
  const activeTodo = todos.find((todo) => todo.id === selectedTodoId) ?? todos[0]

  function selectTodo(id: string) {
    const next = new URLSearchParams(params)
    next.set('todo', id)
    setParams(next)
  }

  function openTodoAction(todo: ApiTodo) {
    navigate(normalizeActionUrl(todo.action_url))
  }

  async function completeTodo(id: string) {
    setMessage(null)
    try {
      await apiPost(`/todos/${id}/complete`)
      await reload()
      setMessage('待办已完成')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '完成待办失败')
    }
  }

  return (
    <MainLayout title="待办中心" subtitle="集中处理审批、任务、资料和系统事项">
      <div className="flex h-full flex-col gap-5">
        <div className="flex items-center justify-between">
          <Tabs tabs={tabs} value={status} onChange={setStatus} />
          <span className="text-sm text-text-muted">{loading ? '加载中...' : `共 ${todos.length} 条`}</span>
        </div>
        {(error || message) && (
          <div className={error ? 'rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error' : 'rounded-md bg-color-success-bg px-4 py-3 text-sm text-color-success'}>
            {error || message}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_1fr] gap-5 overflow-hidden">
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
            <div className="h-full overflow-auto">
              {todos.map((todo) => {
                const active = activeTodo?.id === todo.id
                return (
                  <button
                    key={todo.id}
                    type="button"
                    className={`flex w-full flex-col gap-3 border-b border-border-subtle px-5 py-4 text-left transition-fast last:border-b-0 ${
                      active ? 'bg-hover-bg' : 'hover:bg-hover-bg'
                    }`}
                    onClick={() => selectTodo(todo.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="min-w-0 text-base font-medium text-text-primary">{todo.title}</span>
                      <Badge>{todoTypeLabel(todo.todo_type)}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm text-text-muted">
                      <span>{formatDateTime(todo.created_at)}</span>
                      <span>{statusLabel(todo.status)}</span>
                    </div>
                  </button>
                )
              })}
              {!loading && todos.length === 0 && <EmptyState title="暂无待办" desc="当前筛选下没有待处理事项。" />}
            </div>
          </div>

          <Panel
            className="min-w-0 overflow-auto"
            title="待办详情"
            right={activeTodo && <Tag variant={activeTodo.status === 'completed' ? 'success' : 'warning'}>{statusLabel(activeTodo.status)}</Tag>}
          >
            {activeTodo ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Badge>{todoTypeLabel(activeTodo.todo_type)}</Badge>
                    {activeTodo.due_at && <span className="text-sm text-text-muted">截止 {formatDateTime(activeTodo.due_at)}</span>}
                  </div>
                  <h2 className="text-2xl font-semibold text-text-primary">{activeTodo.title}</h2>
                  <span className="text-sm text-text-muted">创建于 {formatDateTime(activeTodo.created_at)}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <DetailBox label="处理入口" value={activeTodo.action_url || '默认任务中心'} />
                  <DetailBox label="待办编号" value={activeTodo.id} />
                </div>

                <div className="flex items-center gap-3">
                  <Button className="h-10 px-4" onClick={() => openTodoAction(activeTodo)}>
                    <ExternalLink className="h-4 w-4" />
                    打开处理页面
                  </Button>
                  {activeTodo.status !== 'completed' && (
                    <Button variant="secondary" className="h-10 px-4" onClick={() => void completeTodo(activeTodo.id)}>
                      <Check className="h-4 w-4" />
                      标记完成
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState title="选择一个待办" desc="左侧选择待办后，可在这里处理或跳转到对应业务对象。" />
            )}
          </Panel>
        </div>
      </div>
    </MainLayout>
  )
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-bg-tertiary p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-2 truncate text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}
