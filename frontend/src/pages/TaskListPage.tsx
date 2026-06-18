import { MainLayout } from '@/components/layout'
import { Avatar, EmptyState, ProgressBar, SearchInput, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
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
import { ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TaskDetailContent } from '@/pages/TaskDetailPage'

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

const pageSize = 20

function pageFromParams(value: string | null) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function loadTasks(q: string | null, status: string | null, page: number) {
  return apiGet<ApiList<ApiTask>>('/tasks', { q, status, page, page_size: pageSize })
}

export function TaskListPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q')
  const status = params.get('status')
  const page = pageFromParams(params.get('page'))
  const selectedTaskId = params.get('task')
  const [searchValue, setSearchValue] = useState(q ?? '')
  const { data, loading, error } = useApiData(() => loadTasks(q, status, page), [q, status, page])
  const tasks = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(total, page * pageSize)

  function updateParams(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params)
    update(next)
    setParams(next)
  }

  function openTask(taskId: string) {
    updateParams((next) => next.set('task', taskId))
  }

  function closeTask() {
    updateParams((next) => next.delete('task'))
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateParams((next) => {
      const value = searchValue.trim()
      if (value) next.set('q', value)
      else next.delete('q')
      next.set('page', '1')
    })
  }

  function clearSearch() {
    setSearchValue('')
    updateParams((next) => {
      next.delete('q')
      next.set('page', '1')
    })
  }

  function goToPage(nextPage: number) {
    updateParams((next) => {
      next.set('page', String(Math.min(Math.max(nextPage, 1), totalPages)))
    })
  }

  return (
    <MainLayout title="任务">
      <div className="flex h-full flex-col gap-5">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <form className="flex items-center gap-2" onSubmit={submitSearch}>
            <div className="relative">
              <SearchInput
                placeholder="搜索任务名称、编号、负责人、项目..."
                className="w-[360px] bg-bg-secondary"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
              {searchValue && (
                <button
                  type="button"
                  aria-label="清空搜索"
                  className="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary"
                  onClick={clearSearch}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-fill px-4 text-sm font-medium text-primary-text transition-fast hover:bg-black/85"
            >
              <Search className="h-4 w-4" />
              搜索
            </button>
          </form>
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
          </div>
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
                    <Tr
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      className={`cursor-pointer ${selectedTaskId === task.id ? 'bg-hover-bg' : ''}`}
                      onClick={() => openTask(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') openTask(task.id)
                      }}
                    >
                      <Td className="w-[280px]">
                        <button
                          type="button"
                          className="flex w-full flex-col gap-1 text-left"
                          onClick={(event) => {
                            event.stopPropagation()
                            openTask(task.id)
                          }}
                        >
                          <span className="text-base font-medium text-text-primary">{task.name}</span>
                          <span className="text-xs text-text-muted">{task.summary || task.task_no || '无描述'}</span>
                        </button>
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
                        <button
                          type="button"
                          className="text-sm text-text-muted hover:text-text-primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            openTask(task.id)
                          }}
                        >
                          详情
                        </button>
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
            {!loading && tasks.length === 0 && <EmptyState title="暂无任务" desc="当前条件下没有可见任务。" />}
          </div>

          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
            <span className="text-sm text-text-muted">
              {loading ? '加载中...' : `第 ${rangeStart}-${rangeEnd} 条，共 ${total} 条`}
            </span>
            <div className="inline-flex items-center gap-2">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-muted transition-fast hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(page - 1)}
                aria-label="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-20 text-center text-sm text-text-muted">
                {page} / {totalPages}
              </span>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-muted transition-fast hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}
                aria-label="下一页"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {selectedTaskId && (
          <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full justify-end">
            <aside className="pointer-events-auto h-full w-full max-w-full border-l border-border-subtle bg-bg-primary shadow-2xl md:w-[66.666vw] md:max-w-[calc(100vw-220px)]">
              <div className="h-full overflow-auto px-6 py-5">
                <TaskDetailContent id={selectedTaskId} compact onClose={closeTask} />
              </div>
            </aside>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
