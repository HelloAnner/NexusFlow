import { MainLayout } from '@/components/layout'
import { Badge, EmptyState, Panel, StatCard, Tag } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  type ApiConflict,
  type ApiList,
  type ApiTask,
  formatDate,
  riskLabel,
  riskVariant,
  taskStatusLabel,
  taskStatusVariant,
} from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

interface DashboardData {
  dashboard: {
    widgets?: {
      todos?: { count?: number }
      my_tasks?: { count?: number }
      conflicts?: { count?: number }
    }
  }
  tasks: ApiList<ApiTask>
  todos: ApiList<{ id: string; title: string; todo_type?: string; action_url?: string; status?: string }>
  conflicts: ApiList<ApiConflict>
  activities: ApiList<{ id: string; event_type?: string; object_type?: string; created_at?: string }>
}

async function loadDashboard() {
  const [dashboard, tasks, todos, conflicts, activities] = await Promise.all([
    apiGet<DashboardData['dashboard']>('/dashboard'),
    apiGet<ApiList<ApiTask>>('/tasks', { page_size: 5 }),
    apiGet<DashboardData['todos']>('/todos', { status: 'open', page_size: 5 }),
    apiGet<ApiList<ApiConflict>>('/conflicts', { status: 'open', page_size: 5 }),
    apiGet<DashboardData['activities']>('/dashboard/recent-activities'),
  ])
  return { dashboard, tasks, todos, conflicts, activities }
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error } = useApiData(loadDashboard)
  const dateStr = format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhCN })
  const widgets = data?.dashboard.widgets
  const taskItems = data?.tasks.items ?? []
  const todoItems = data?.todos.items ?? []
  const conflictItems = data?.conflicts.items ?? []
  const activityItems = data?.activities.items.slice(0, 5) ?? []

  return (
    <MainLayout title={`早上好，${user?.login_name ?? '同事'}`} subtitle={dateStr}>
      <div className="flex flex-col gap-6">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="grid grid-cols-4 gap-5">
          <StatCard label="进行中任务" value={widgets?.my_tasks?.count ?? taskItems.length} sub="来自真实任务数据" />
          <StatCard label="待处理审批" value={widgets?.todos?.count ?? todoItems.length} sub="待办与审批入口" />
          <StatCard label="冲突风险" value={widgets?.conflicts?.count ?? conflictItems.length} sub="待处理冲突" />
          <StatCard label="最近动态" value={activityItems.length} sub="系统事件流" />
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-6">
          <Panel
            title="我的任务"
            right={
              <Link to="/tasks" className="flex items-center text-sm text-text-muted hover:text-text-primary">
                查看全部 <ChevronRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="mb-2 text-sm text-text-muted">{loading ? '加载中...' : `${taskItems.length} 个任务`}</div>
            {taskItems.length === 0 && !loading ? (
              <EmptyState title="暂无任务" desc="当前账号可见范围内暂无任务。" />
            ) : (
              <div className="flex flex-col">
                {taskItems.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="-mx-5 flex items-center justify-between border-b border-border-subtle px-5 py-4 transition-fast last:border-b-0 hover:bg-hover-bg"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-medium text-text-primary">{task.name}</span>
                      <span className="text-sm text-text-muted">截止 {formatDate(task.due_at)}</span>
                    </div>
                    <Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <div className="flex flex-col gap-6">
            <Panel
              title="我的待办"
              right={
                <Link to="/todos" className="flex items-center text-sm text-text-muted hover:text-text-primary">
                  查看全部 <ChevronRight className="h-4 w-4" />
                </Link>
              }
            >
              {todoItems.length === 0 && !loading ? (
                <EmptyState title="暂无待办" desc="当前没有需要处理的事项。" />
              ) : (
                <div className="flex flex-col">
                  {todoItems.map((todo) => (
                    <Link
                      key={todo.id}
                      to={todo.action_url || '/tasks'}
                      className="flex items-center justify-between border-b border-border-subtle py-3 transition-fast last:border-b-0 hover:bg-hover-bg"
                    >
                      <span className="text-base text-text-primary">{todo.title}</span>
                      <Badge>{todo.todo_type ?? '待办'}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="风险提醒">
              {conflictItems.length === 0 && !loading ? (
                <EmptyState title="暂无风险" desc="当前没有待处理冲突。" />
              ) : (
                <div className="flex flex-col">
                  {conflictItems.map((conflict) => (
                    <Link
                      key={conflict.id}
                      to="/conflicts"
                      className="flex items-center justify-between border-b border-border-subtle py-4 transition-fast last:border-b-0 hover:bg-hover-bg"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-medium text-text-primary">{conflict.task_id ?? '冲突记录'}</span>
                        <span className="text-sm text-text-muted">{formatDate(conflict.conflict_date_start)}</span>
                      </div>
                      <Tag variant={riskVariant(conflict.risk_level)}>{riskLabel(conflict.risk_level)}</Tag>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        <Panel title="最近动态">
          {activityItems.length === 0 && !loading ? (
            <EmptyState title="暂无动态" desc="系统暂无可展示的事件。" />
          ) : (
            <div className="grid grid-cols-5 gap-4">
              {activityItems.map((event) => (
                <div key={event.id} className="rounded-md bg-bg-tertiary p-4">
                  <div className="text-sm font-medium text-text-primary">{event.event_type ?? '系统事件'}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    {event.object_type ?? '对象'} · {formatDate(event.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </MainLayout>
  )
}
