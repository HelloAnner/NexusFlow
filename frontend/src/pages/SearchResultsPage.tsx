import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, SearchInput, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { cn } from '@/lib/utils'
import { Save, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

interface SearchResult {
  object_type: string
  object_id: string
  title: string
  summary?: string
  status?: string | null
  target_url?: string
  updated_at?: string
}

interface SavedFilter {
  id: string
  name?: string
  filter_type?: string
  created_at?: string
  payload?: Record<string, unknown>
}

const typeTabs = [
  { value: 'all', label: '全部' },
  { value: 'task', label: '任务' },
  { value: 'project', label: '项目' },
  { value: 'person', label: '人员' },
  { value: 'resource', label: '资料' },
]

const typeLabels: Record<string, string> = {
  task: '任务',
  project: '项目',
  person: '人员',
  resource: '资料',
}

function loadSearch(q: string) {
  return Promise.all([
    apiGet<{ items: SearchResult[] }>('/search', { q }),
    apiGet<{ items: SavedFilter[] }>('/saved-filters'),
  ]).then(([results, filters]) => ({ results: results.items, filters: filters.items }))
}

export function SearchResultsPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [activeType, setActiveType] = useState('all')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { data, loading, error, reload } = useApiData(() => loadSearch(q), [q])
  const results = data?.results ?? []
  const filtered = useMemo(
    () => results.filter((item) => activeType === 'all' || item.object_type === activeType),
    [activeType, results]
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate(`/search?q=${encodeURIComponent(input.trim())}`)
  }

  async function saveFilter() {
    if (!q.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      await apiPost('/saved-filters', {
        filter_type: 'search',
        name: `搜索：${q}`,
        query: q,
      })
      setMessage('筛选已保存。')
      await reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout title="全局搜索" subtitle="按权限检索任务、项目、人员和资料">
      <div className="flex flex-col gap-6">
        {(error || message) && (
          <div className={cn('rounded-md px-4 py-3 text-sm', error ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info')}>
            {error || message}
          </div>
        )}

        <form onSubmit={submit} className="flex items-center gap-3">
          <SearchInput
            className="h-11 w-[520px]"
            placeholder="搜索任务、项目、人员、资料..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button className="h-11 px-4">
            <Search className="h-4 w-4" />
            搜索
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-11 px-4"
            disabled={!q.trim() || saving}
            onClick={() => void saveFilter()}
          >
            <Save className="h-4 w-4" />
            保存筛选
          </Button>
        </form>

        <div className="grid grid-cols-[1fr_320px] gap-6">
          <div className="flex flex-col gap-4">
            <div className="inline-flex w-fit items-center gap-1 rounded-md bg-bg-secondary p-1">
              {typeTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveType(tab.value)}
                  className={cn(
                    'rounded-sm px-4 py-1.5 text-sm transition-fast',
                    activeType === tab.value ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Panel
              title="搜索结果"
              right={<span className="text-sm text-text-muted">{loading ? '加载中...' : `${filtered.length} 条`}</span>}
            >
              <div className="flex flex-col divide-y divide-border-subtle">
                {filtered.map((item) => (
                  <Link
                    key={`${item.object_type}-${item.object_id}`}
                    to={item.target_url || '/'}
                    className="-mx-5 grid grid-cols-[110px_1fr_140px] items-center gap-4 px-5 py-4 transition-fast hover:bg-hover-bg"
                  >
                    <Badge>{typeLabels[item.object_type] ?? item.object_type}</Badge>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-base font-medium text-text-primary">{item.title}</span>
                      <span className="truncate text-sm text-text-muted">{item.summary || item.object_id}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {item.status && <Tag variant="info">{item.status}</Tag>}
                      <span className="text-xs text-text-muted">{formatDateTime(item.updated_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
              {!loading && filtered.length === 0 && (
                <EmptyState title="暂无结果" desc={q ? '当前关键词没有可见结果。' : '输入关键词后开始搜索。'} />
              )}
            </Panel>
          </div>

          <Panel title="已保存筛选">
            <div className="flex flex-col divide-y divide-border-subtle">
              {(data?.filters ?? []).map((filter) => (
                <button
                  key={filter.id}
                  className="py-3 text-left transition-fast hover:text-text-primary"
                  onClick={() => navigate(`/search?q=${encodeURIComponent(String(filter.payload?.query ?? filter.name ?? ''))}`)}
                >
                  <span className="block text-sm font-medium text-text-primary">{filter.name || '未命名筛选'}</span>
                  <span className="text-xs text-text-muted">{formatDateTime(filter.created_at)}</span>
                </button>
              ))}
            </div>
            {!loading && (data?.filters ?? []).length === 0 && <EmptyState title="暂无保存筛选" desc="保存常用关键词后会出现在这里。" />}
          </Panel>
        </div>
      </div>
    </MainLayout>
  )
}
