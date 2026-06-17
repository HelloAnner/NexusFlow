import { MainLayout } from '@/components/layout'
import { Panel, SearchInput, Tag, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  configMenuItems,
  configStats,
  workflowTemplates,
  permissionTemplates,
  notifyRules,
  myTasks,
  myTodos,
  risks,
} from '@/mocks/configCenter'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'

export function ConfigCenterPage() {
  const [activeMenu, setActiveMenu] = useState(configMenuItems[0].id)

  return (
    <MainLayout title="配置中心" subtitle="流程、权限、通知与系统设置">
      <div className="flex flex-col gap-6">
        {/* Config Top Bar */}
        <div className="flex items-center justify-between">
          <SearchInput placeholder="🔍 搜索配置项..." className="w-80" />
          <div className="flex items-center gap-8">
            {configStats.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-2xl font-bold text-text-primary">{s.value}</span>
                <span className="text-sm text-text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Config Content */}
        <div className="flex h-[420px] gap-6">
          {/* Config Menu */}
          <div className="flex w-[220px] flex-col gap-1">
            {configMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveMenu(item.id)}
                className={cn(
                  'w-full rounded-md px-4 py-2.5 text-left text-sm font-medium transition-fast',
                  activeMenu === item.id
                    ? 'bg-primary-fill text-primary-text'
                    : 'text-text-muted hover:bg-hover-bg hover:text-text-primary'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Config Panels */}
          <div className="flex flex-1 flex-col gap-6">
            {/* Top Row */}
            <div className="flex h-[260px] gap-6">
              {/* Workflow Templates */}
              <Panel title="流程模板" className="flex-1 overflow-hidden">
                <div className="flex flex-col">
                  {workflowTemplates.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-medium text-text-primary">{item.name}</span>
                        <span className="text-sm text-text-muted">{item.desc}</span>
                      </div>
                      <span className="rounded-md bg-bg-tertiary px-3 py-1 text-xs font-medium text-text-secondary">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Permission Templates */}
              <Panel title="权限模板" className="flex-1 overflow-hidden">
                <div className="flex flex-col">
                  {permissionTemplates.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-medium text-text-primary">{item.name}</span>
                        <span className="text-sm text-text-muted">{item.desc}</span>
                      </div>
                      <span className="rounded-md bg-bg-tertiary px-3 py-1 text-xs font-medium text-text-secondary">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* Notify Rules */}
            <Panel title="通知规则" className="flex-1 overflow-hidden">
              <div className="flex flex-col">
                {notifyRules.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-medium text-text-primary">{item.name}</span>
                      <span className="text-sm text-text-muted">{item.desc}</span>
                    </div>
                    <span className="rounded-md bg-bg-tertiary px-3 py-1 text-xs font-medium text-text-secondary">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {/* Related Section */}
        <div className="grid grid-cols-[1fr_380px] gap-6">
          <Panel
            title="我的任务"
            right={
              <Link
                to="/tasks"
                className="flex items-center text-sm text-text-muted hover:text-text-primary"
              >
                查看全部 <ChevronRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="mb-2 text-sm text-text-muted">6 个进行中任务</div>
            <div className="flex flex-col">
              {myTasks.map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  className="group -mx-5 flex items-center justify-between border-b border-border-subtle px-5 py-4 transition-fast last:border-b-0 hover:bg-hover-bg"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-medium text-text-primary group-hover:text-text-primary">
                      {t.name}
                    </span>
                    <span className="text-sm text-text-muted">截止 {t.end}</span>
                  </div>
                  <Tag variant={t.tag}>{t.status}</Tag>
                </Link>
              ))}
            </div>
          </Panel>

          <div className="flex flex-col gap-6">
            <Panel title="我的待办">
              <div className="flex flex-col">
                {myTodos.map((td) => (
                  <div
                    key={td.id}
                    className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0"
                  >
                    <span className="text-base text-text-primary">{td.title}</span>
                    <Badge>{td.type}</Badge>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="风险提醒">
              <div className="flex flex-col">
                {risks.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-b border-border-subtle py-4 last:border-b-0"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-medium text-text-primary">{r.title}</span>
                      <span className="text-sm text-text-muted">{r.desc}</span>
                    </div>
                    <span className="text-sm text-color-error">{r.tag}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
