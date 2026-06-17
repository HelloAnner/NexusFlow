import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Table, Tabs, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiTodo, formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

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
  const [message, setMessage] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(() => loadTodos(status), [status])
  const todos = data?.items ?? []

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

        <div className="flex-1 overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
          <div className="h-full overflow-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th className="w-[360px]">待办事项</Th>
                  <Th className="w-[120px]">类型</Th>
                  <Th className="w-[120px]">状态</Th>
                  <Th className="w-[180px]">创建时间</Th>
                  <Th className="w-[180px]">操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {todos.map((todo) => (
                  <Tr key={todo.id}>
                    <Td className="w-[360px]">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-text-primary">{todo.title}</span>
                        {todo.action_url && <span className="text-xs text-text-muted">{todo.action_url}</span>}
                      </div>
                    </Td>
                    <Td className="w-[120px]"><Badge>{todoTypeLabel(todo.todo_type)}</Badge></Td>
                    <Td className="w-[120px]">{statusLabel(todo.status)}</Td>
                    <Td className="w-[180px]">{formatDateTime(todo.created_at)}</Td>
                    <Td className="w-[180px]">
                      <div className="flex items-center gap-2">
                        <Link to={normalizeActionUrl(todo.action_url)}>
                          <Button variant="secondary" className="h-9 px-3 py-0 text-sm">
                            <ExternalLink className="h-4 w-4" />
                            打开
                          </Button>
                        </Link>
                        {todo.status !== 'completed' && (
                          <Button className="h-9 px-3 py-0 text-sm" onClick={() => void completeTodo(todo.id)}>
                            <Check className="h-4 w-4" />
                            完成
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {!loading && todos.length === 0 && <EmptyState title="暂无待办" desc="当前筛选下没有待处理事项。" />}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
