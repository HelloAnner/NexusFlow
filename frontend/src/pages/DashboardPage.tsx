import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, StatCard, Tag } from '@/components/ui'
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
import { ChevronRight, Plus } from 'lucide-react'
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
      <div className="flex flex-col gap-4">
        <div className="-mt-[58px] mb-3 flex justify-end">
          <Link to="/tasks/new">
            <Button className="h-10 px-4">
              <Plus className="h-4 w-4" />
              新建任务
            </Button>
          </Link>
        </div>
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="今日待处理" value={widgets?.todos?.count ?? todoItems.length} />
          <StatCard label="今日截止" value={taskItems.length} />
          <StatCard label="本周冲突" value={widgets?.conflicts?.count ?? conflictItems.length} className={(widgets?.conflicts?.count ?? conflictItems.length) > 0 ? '[&>:nth-child(2)]:text-color-error' : undefined} />
          <StatCard label="待审批" value={activityItems.length} />
        </div>

        <div className="grid min-h-[calc(100vh-284px)] gap-3 xl:grid-cols-[1fr_1fr]">
          <Panel
            title="今日重点"
            right={
              <Link to="/tasks" className="flex items-center text-sm text-text-muted hover:text-text-primary">
                {taskItems.length + todoItems.length} 项 <ChevronRight className="h-4 w-4" />
              </Link>
            }
          >
            {taskItems.length === 0 && todoItems.length === 0 && !loading ? (
              <EmptyState title="暂无重点事项" desc="当前没有需要优先处理的事项。" />
            ) : (
              <div className="flex flex-col divide-y divide-border-subtle">
                {todoItems.slice(0, 2).map((todo, index) => (
                  <Link
                    key={todo.id}
                    to={`/todos?todo=${encodeURIComponent(todo.id)}`}
                    className="flex items-center gap-4 py-4 transition-fast hover:bg-hover-bg"
                  >
                    <span className={index === 0 ? 'h-10 w-0.5 rounded-full bg-color-info' : 'h-10 w-0.5 rounded-full bg-color-error'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold text-text-primary">{todo.title}</div>
                      <div className="mt-1 truncate text-sm text-text-muted">{todo.todo_type ?? '待办'} · 今日处理</div>
                    </div>
                    <Badge>{todo.status ?? 'open'}</Badge>
                  </Link>
                ))}
                {taskItems.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks?task=${encodeURIComponent(task.id)}`}
                    className="flex items-center gap-4 py-4 transition-fast hover:bg-hover-bg"
                  >
                    <span className="h-10 w-0.5 rounded-full bg-color-info" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-text-primary">{task.name}</span>
                      <span className="mt-1 block text-sm text-text-muted">截止 {formatDate(task.due_at)}</span>
                    </div>
                    <Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="我的日程"
            right={<span className="text-sm text-text-muted">未来 7 天</span>}
          >
            <div className="flex min-h-[420px] flex-1 flex-col rounded-md bg-bg-tertiary p-4">
              <div className="mb-4 text-sm text-text-muted">[ 迷你甘特摘要 ]</div>
              <div className="flex flex-col gap-4">
                {taskItems.slice(0, 4).map((task, index) => (
                  <div key={task.id} className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <div className="truncate text-sm font-medium text-text-secondary">{task.name}</div>
                    <div className="h-6 rounded-sm bg-primary-fill" style={{ width: `${Math.max(24, 80 - index * 12)}%` }} />
                  </div>
                ))}
                {conflictItems.slice(0, 3).map((conflict) => (
                  <Link key={conflict.id} to={`/conflicts?conflict=${encodeURIComponent(conflict.id)}`} className="flex items-center justify-between rounded-md bg-bg-secondary px-3 py-2">
                    <span className="text-sm text-text-secondary">{conflict.task_id ?? '冲突记录'}</span>
                    <Tag variant={riskVariant(conflict.risk_level)}>{riskLabel(conflict.risk_level)}</Tag>
                  </Link>
                ))}
              </div>
              {!loading && taskItems.length === 0 && conflictItems.length === 0 && (
                <EmptyState title="暂无日程" desc="未来一周没有排程数据。" className="flex-1" />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </MainLayout>
  )
}
