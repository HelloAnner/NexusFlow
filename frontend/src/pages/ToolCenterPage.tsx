import { MainLayout } from '@/components/layout'
import { Button, SearchInput, Tabs } from '@/components/ui'
import {
  agentTools,
  commonTools,
  favoriteTools,
  recommendedTools,
  toolTabs,
  type ToolItem,
  type ToolTag,
} from '@/mocks/toolCenter'
import {
  Award,
  BookOpen,
  FileText,
  Image,
  Languages,
  Presentation,
  ScrollText,
  Table,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

const iconMap: Record<string, LucideIcon> = {
  FileText,
  Languages,
  Table,
  Image,
  ScrollText,
  Award,
  BookOpen,
  Presentation,
}

function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name]
  if (!Icon) return null
  return <Icon className={className} />
}

function ToolCard({ tool }: { tool: ToolItem }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-tertiary">
          <ToolIcon name={tool.icon} className="h-[18px] w-[18px] text-text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-semibold text-text-primary">{tool.name}</span>
          <span className="text-sm text-text-muted">{tool.category}</span>
        </div>
      </div>
      <p className="text-sm text-text-secondary">{tool.description}</p>
      <div className="mt-auto flex items-center gap-3">
        <Button variant="primary" className="h-9 px-4">
          打开
        </Button>
        <Button variant="ghost" className="h-9 px-4 text-text-muted">
          收藏
        </Button>
      </div>
    </div>
  )
}

function Section({ title, tools }: { title: string; tools: ToolItem[] }) {
  if (tools.length === 0) return null
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <div className="grid grid-cols-4 gap-4">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  )
}

function FavoriteItem({ item }: { item: (typeof favoriteTools)[number] }) {
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-tertiary">
        <ToolIcon name={item.icon} className="h-4 w-4 text-text-primary" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text-primary">{item.name}</span>
        <span className="text-xs text-text-muted">{item.useCount}</span>
      </div>
    </div>
  )
}

function RecommendedItem({ item }: { item: (typeof recommendedTools)[number] }) {
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-tertiary">
        <ToolIcon name={item.icon} className="h-4 w-4 text-text-primary" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text-primary">{item.name}</span>
        <span className="text-xs text-text-muted">{item.reason}</span>
      </div>
    </div>
  )
}

export function ToolCenterPage() {
  const [activeTab, setActiveTab] = useState<ToolTag>('all')

  const filteredCommon = useMemo(
    () => commonTools.filter((t) => activeTab === 'all' || t.tags.includes(activeTab)),
    [activeTab]
  )
  const filteredAgent = useMemo(
    () => agentTools.filter((t) => activeTab === 'all' || t.tags.includes(activeTab)),
    [activeTab]
  )

  return (
    <MainLayout title="工具台" subtitle="常用工具与智能体入口">
      <div className="flex flex-col gap-6">
        {/* Tool Top Bar */}
        <div className="flex items-center justify-between gap-4">
          <SearchInput placeholder="搜索工具、智能体..." className="w-[360px]" />
          <Tabs tabs={toolTabs} value={activeTab} onChange={(v) => setActiveTab(v as ToolTag)} />
          <Button variant="secondary" className="h-9 px-4">
            我的收藏
          </Button>
        </div>

        {/* Tool Content */}
        <div className="grid grid-cols-[1fr_340px] gap-6">
          <div className="flex flex-col gap-6">
            <Section title="常用工具" tools={filteredCommon} />
            <Section title="智能体工具" tools={filteredAgent} />
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
              <h3 className="text-base font-semibold text-text-primary">我的常用</h3>
              <div className="flex flex-col">
                {favoriteTools.map((item) => (
                  <FavoriteItem key={item.id} item={item} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
              <h3 className="text-base font-semibold text-text-primary">推荐工具</h3>
              <div className="flex flex-col">
                {recommendedTools.map((item) => (
                  <RecommendedItem key={item.id} item={item} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
              <h3 className="text-base font-semibold text-text-primary">工具配置</h3>
              <p className="text-sm text-text-secondary">
                管理员可配置工具可见范围、角色权限与首页推荐
              </p>
              <Button variant="secondary" className="w-full">
                进入配置
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
