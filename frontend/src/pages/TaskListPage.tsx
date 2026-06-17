import { MainLayout } from '@/components/layout'
import { Avatar, EmptyState, ProgressBar, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet } from '@/lib/api'
import {
  type ApiList,
  type ApiTask,
  formatDate,
  numberValue,
  priorityLabel,
  taskStatusLabel,
  taskStatusVariant,
  textFromPayload,
} from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

const filters = ['状态', '类型', '优先级', '负责人', '所属组织', '时间范围']

const columns = [
  { label: '任务名称', width: 'w-[280px]' },
  { label: '状态', width: 'w-[90px]' },
  { label: '类型', width: 'w-[90px]' },
  { label: '负责人', width: 'w-[120px]' },
  { label: '起止时间', width: 'w-[180px]' },
  { label: '进度', width: 'w-[100px]' },
  { label: '优先级', width: 'w-[80px]' },
  { label: '操作', width: 'w-[60px]' },
]

function loadTasks(q: string | null, status: string | null) {
  return apiGet<ApiList<ApiTask>>('/tasks', { q, status, page_size: 50 })
}

export function TaskListPage() {
  const [params] = useSearchParams()
  const q = params.get('q')
  const status = params.get('status')
  const { data, loading, error } = useApiData(() => loadTasks(q, status), [q, status])
  const tasks = data?.items ?? []

  return (
    <MainLayout title="任务">
      <div className="flex h-full flex-col gap-5">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="flex items-center gap-2">
          {filters.map((label) => (
            <button
              key={label}
              className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-text-secondary transition-fast hover:bg-hover-bg"
            >
              {label}
              <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
            </button>
          ))}
          <button
            aria-label="更多筛选"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-fast hover:bg-hover-bg"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
          <div className="flex-1 overflow-auto">
            <Table>
              <Thead>
                <Tr>
                  {columns.map((col) => (
                    <Th key={col.label} className={`text-sm ${col.width}`}>
                      {col.label}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {tasks.map((task) => {
                  const progress = numberValue(task.progress)
                  const owner = textFromPayload(task.payload, 'owner_name', task.owner_id ?? '未设置')
                  return (
                    <Tr key={task.id}>
                      <Td className="w-[280px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-base font-medium text-text-primary">{task.name}</span>
                          <span className="text-xs text-text-muted">{task.summary || task.task_no || '无描述'}</span>
                        </div>
                      </Td>
                      <Td className="w-[90px]">
                        <Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag>
                      </Td>
                      <Td className="w-[90px]">
                        <span className="text-sm text-text-secondary">{task.sub_type || '常规'}</span>
                      </Td>
                      <Td className="w-[120px]">
                        <div className="flex items-center gap-2">
                          <Avatar name={owner} />
                          <span className="truncate text-sm text-text-secondary">{owner}</span>
                        </div>
                      </Td>
                      <Td className="w-[180px]">
                        <span className="text-sm text-text-secondary">
                          {formatDate(task.start_at)} - {formatDate(task.due_at)}
                        </span>
                      </Td>
                      <Td className="w-[100px]">
                        <div className="flex flex-col gap-2">
                          <ProgressBar value={progress} className="h-1" />
                          <span className="text-xs text-text-muted">{Math.round(progress)}%</span>
                        </div>
                      </Td>
                      <Td className="w-[80px]">{priorityLabel(task.priority)}</Td>
                      <Td className="w-[60px]">
                        <Link to={`/tasks/${task.id}`} className="text-sm text-text-muted hover:text-text-primary">
                          详情
                        </Link>
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
            {!loading && tasks.length === 0 && <EmptyState title="暂无任务" desc="当前条件下没有可见任务。" />}
          </div>

          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
            <span className="text-sm text-text-muted">{loading ? '加载中...' : `共 ${tasks.length} 条`}</span>
            <div className="inline-flex items-center gap-1">
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-sm font-medium text-primary-text">
                1
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
