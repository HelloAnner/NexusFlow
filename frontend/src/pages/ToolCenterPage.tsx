import { MainLayout } from '@/components/layout'
import { Button, EmptyState, SearchInput, Tabs } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiTool } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Award, BookOpen, FileText, Image, Languages, Presentation, ScrollText, Table, Wrench, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const iconMap: Record<string, LucideIcon> = {
  FileText,
  Languages,
  Table,
  Image,
  ScrollText,
  Award,
  BookOpen,
  Presentation,
  Wrench,
}

const toolTabs = [
  { value: 'all', label: '全部' },
  { value: 'common', label: '常用工具' },
  { value: 'agent', label: '智能体' },
  { value: 'document', label: '文档' },
  { value: 'data', label: '数据' },
]

function ToolIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = iconMap[name || ''] ?? Wrench
  return <Icon className={className} />
}

function ToolCard({ tool, onOpen }: { tool: ApiTool; onOpen: (tool: ApiTool) => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-tertiary">
          <ToolIcon name={tool.icon || String(tool.payload?.icon ?? '')} className="h-[18px] w-[18px] text-text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-semibold text-text-primary">{tool.name}</span>
          <span className="text-sm text-text-muted">{tool.category ?? 'common'}</span>
        </div>
      </div>
      <p className="text-sm text-text-secondary">{tool.description || '暂无描述'}</p>
      <div className="mt-auto flex items-center gap-3">
        <Button variant="primary" className="h-9 px-4" onClick={() => onOpen(tool)}>打开</Button>
        <Link to={`/tools/${tool.id}`}>
          <Button variant="ghost" className="h-9 px-4 text-text-muted">详情</Button>
        </Link>
      </div>
    </div>
  )
}

function Section({ title, tools, onOpen }: { title: string; tools: ApiTool[]; onOpen: (tool: ApiTool) => void }) {
  if (tools.length === 0) return null
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <div className="grid grid-cols-4 gap-4">
        {tools.map((tool) => <ToolCard key={tool.id} tool={tool} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

export function ToolCenterPage() {
  const [activeTab, setActiveTab] = useState('all')
  const [q, setQ] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const { data, loading, error } = useApiData(() => apiGet<ApiList<ApiTool>>('/tools'))
  const tools = useMemo(() => {
    return (data?.items ?? []).filter((tool) => {
      const matchesTab = activeTab === 'all' || tool.category === activeTab || String(tool.payload?.tag ?? '') === activeTab
      const matchesQuery = !q || `${tool.name} ${tool.description ?? ''}`.toLowerCase().includes(q.toLowerCase())
      return matchesTab && matchesQuery
    })
  }, [activeTab, data?.items, q])
  const commonTools = tools.filter((tool) => tool.category !== 'agent')
  const agentTools = tools.filter((tool) => tool.category === 'agent')

  async function openTool(tool: ApiTool) {
    await apiPost(`/tools/${tool.id}/usage`, { source_type: 'manual' })
    if (tool.entry_url) {
      window.open(tool.entry_url, '_blank', 'noopener,noreferrer')
    } else {
      setMessage(`${tool.name} 已记录使用，当前工具未配置入口地址。`)
    }
  }

  return (
    <MainLayout title="工具台" subtitle="常用工具与智能体入口">
      <div className="flex flex-col gap-6">
        {(error || message) && (
          <div className={`rounded-md px-4 py-3 text-sm ${error ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
            {error || message}
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <SearchInput placeholder="搜索工具、智能体..." className="w-[360px]" value={q} onChange={(event) => setQ(event.target.value)} />
          <Tabs tabs={toolTabs} value={activeTab} onChange={setActiveTab} />
          <Button variant="secondary" className="h-9 px-4">我的收藏</Button>
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-6">
          <div className="flex flex-col gap-6">
            <Section title="常用工具" tools={commonTools} onOpen={(tool) => void openTool(tool)} />
            <Section title="智能体工具" tools={agentTools} onOpen={(tool) => void openTool(tool)} />
            {!loading && tools.length === 0 && <EmptyState title="暂无工具" desc="当前筛选下没有可用工具。" />}
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
              <h3 className="text-base font-semibold text-text-primary">我的常用</h3>
              {tools.slice(0, 5).map((tool) => (
                <button key={tool.id} onClick={() => void openTool(tool)} className="flex items-center gap-3 py-2 text-left first:pt-0 last:pb-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-tertiary">
                    <ToolIcon name={tool.icon} className="h-4 w-4 text-text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">{tool.name}</span>
                    <span className="text-xs text-text-muted">{tool.category}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
              <h3 className="text-base font-semibold text-text-primary">工具配置</h3>
              <p className="text-sm text-text-secondary">管理员可在配置中心维护工具可见范围、角色权限与首页推荐。</p>
              <Link to="/config" className="inline-flex w-full">
                <Button variant="secondary" className="w-full">进入配置</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
