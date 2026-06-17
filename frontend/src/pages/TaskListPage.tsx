import { MainLayout } from '@/components/layout'
import { Table, Thead, Tbody, Tr, Th, Td, Tag, Avatar, ProgressBar } from '@/components/ui'
import { taskList } from '@/mocks/taskList'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

const filters = ['状态', '类型', '优先级', '负责人', '所属组织', '时间范围']

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  进行中: 'success',
  待确认: 'warning',
  待审批: 'error',
  已完成: 'info',
}

const riskClass: Record<string, string> = {
  正常: 'text-color-success',
  低: 'text-color-info',
  中: 'text-color-warning',
  高: 'text-color-error',
}

const columns = [
  { label: '任务名称', width: 'w-[280px]' },
  { label: '状态', width: 'w-[80px]' },
  { label: '类型', width: 'w-[90px]' },
  { label: '负责人', width: 'w-[100px]' },
  { label: '起止时间', width: 'w-[160px]' },
  { label: '进度', width: 'w-[80px]' },
  { label: '风险', width: 'w-[80px]' },
  { label: '操作', width: 'w-[60px]' },
]

export function TaskListPage() {
  return (
    <MainLayout title="任务">
      <div className="flex h-full flex-col gap-5">
        {/* Filter Bar */}
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

        {/* Task Table Card */}
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
                {taskList.map((task) => (
                  <Tr key={task.id}>
                    <Td className="w-[280px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-medium text-text-primary">{task.name}</span>
                        <span className="text-xs text-text-muted">{task.desc}</span>
                      </div>
                    </Td>
                    <Td className="w-[80px]">
                      <Tag variant={statusVariant[task.status] ?? 'info'}>{task.status}</Tag>
                    </Td>
                    <Td className="w-[90px]">
                      <span className="text-sm text-text-secondary">{task.type}</span>
                    </Td>
                    <Td className="w-[100px]">
                      <div className="flex items-center gap-2">
                        <Avatar name={task.owner} />
                        <span className="text-sm text-text-secondary">{task.owner}</span>
                      </div>
                    </Td>
                    <Td className="w-[160px]">
                      <span className="text-sm text-text-secondary">{task.dateRange}</span>
                    </Td>
                    <Td className="w-[80px]">
                      <div className="flex flex-col gap-2">
                        {task.progress !== null ? (
                          <ProgressBar value={task.progress} className="h-1" />
                        ) : (
                          <div className="h-1 w-full rounded-full bg-bg-tertiary" />
                        )}
                        <span className="text-xs text-text-muted">
                          {task.progress !== null ? `${task.progress}%` : '—'}
                        </span>
                      </div>
                    </Td>
                    <Td className="w-[80px]">
                      <span className={`text-sm ${riskClass[task.risk] ?? 'text-text-secondary'}`}>
                        {task.risk}
                      </span>
                    </Td>
                    <Td className="w-[60px]">
                      <Link
                        to={`/tasks/${task.id}`}
                        className="text-sm text-text-muted hover:text-text-primary"
                      >
                        详情
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          {/* Table Footer */}
          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
            <span className="text-sm text-text-muted">共 6 条</span>
            <div className="inline-flex items-center gap-1">
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm text-text-muted transition-fast hover:bg-hover-bg">
                &lt;
              </button>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-sm font-medium text-primary-text">
                1
              </button>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm text-text-muted transition-fast hover:bg-hover-bg">
                2
              </button>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm text-text-muted transition-fast hover:bg-hover-bg">
                3
              </button>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm text-text-muted transition-fast hover:bg-hover-bg">
                &gt;
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
