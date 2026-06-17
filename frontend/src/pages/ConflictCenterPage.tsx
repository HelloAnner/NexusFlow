import { MainLayout } from '@/components/layout'
import {
  Badge,
  Button,
  Panel,
  StatCard,
  Tabs,
  Tag,
} from '@/components/ui'
import {
  conflicts,
  deptWarnings,
  filterTabs,
  myTasks,
  risks,
  summaryStats,
  todos,
  topStats,
  typeDistribution,
} from '@/mocks/conflictCenter'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

function LevelTag({ level }: { level: string }) {
  const variant =
    level === '高' ? 'error' : level === '中' ? 'warning' : 'success'
  return <Tag variant={variant}>{level}</Tag>
}

function StatusTag({ status }: { status: string }) {
  const variant =
    status === '待处理' ? 'warning' : status === '处理中' ? 'info' : 'success'
  return <Tag variant={variant}>{status}</Tag>
}

export function ConflictCenterPage() {
  const [activeTab, setActiveTab] = useState('all')

  const filteredConflicts =
    activeTab === 'all'
      ? conflicts
      : conflicts.filter((c) => {
          const map: Record<string, string> = {
            overload: '人员超载',
            time: '时间冲突',
            org: '跨组织冲突',
            permission: '权限冲突',
            resource: '资源冲突',
          }
          return c.type === map[activeTab]
        })

  return (
    <MainLayout title="冲突中心" subtitle="负载、时间与资源冲突处理">
      <div className="flex flex-col gap-6">
        {/* Top stats */}
        <div className="grid grid-cols-4 gap-5">
          {topStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
          ))}
        </div>

        {/* Filter + sort */}
        <div className="flex items-center justify-between">
          <Tabs
            tabs={filterTabs}
            value={activeTab}
            onChange={setActiveTab}
          />
          <button className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-fast">
            按风险等级
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Conflict content */}
        <div className="grid grid-cols-[1fr_340px] gap-6">
          {/* Conflict list */}
          <div className="flex flex-col gap-4">
            {filteredConflicts.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge>{c.type}</Badge>
                    <LevelTag level={c.level} />
                  </div>
                  <StatusTag status={c.status} />
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-text-primary">
                    {c.title}
                  </h3>
                  <p className="text-sm text-text-muted">{c.desc}</p>
                </div>

                <div className="flex items-center gap-4 text-sm text-text-muted">
                  <span>涉及：{c.target}</span>
                  <span>{c.time}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="primary" className="h-8 px-4 text-sm">
                    处理
                  </Button>
                  <Button variant="ghost" className="h-8 px-4 text-sm">
                    转交
                  </Button>
                  <Button variant="ghost" className="h-8 px-4 text-sm">
                    忽略
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Conflict summary */}
          <div className="flex flex-col gap-6">
            <Panel className="gap-5">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-bg-tertiary p-4">
                {summaryStats.map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-text-muted">{s.label}</span>
                    <span className="text-stat font-bold text-text-primary">
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-text-primary">
                  按类型分布
                </h4>
                <div className="flex flex-col">
                  {typeDistribution.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between border-b border-border-subtle py-2.5 last:border-b-0"
                    >
                      <span className="text-sm text-text-secondary">
                        {item.label}
                      </span>
                      <span className="text-sm font-medium text-text-primary">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-text-primary">
                  部门负载预警
                </h4>
                <div className="flex flex-col">
                  {deptWarnings.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between border-b border-border-subtle py-2.5 last:border-b-0"
                    >
                      <span className="text-sm text-text-secondary">
                        {item.label}
                      </span>
                      <span className="text-sm font-medium text-text-primary">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/* Related section */}
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
            <div className="mb-2 text-sm text-text-muted">
              {myTasks.length} 个进行中任务
            </div>
            <div className="flex flex-col">
              {myTasks.map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  className="group flex items-center justify-between border-b border-border-subtle py-4 last:border-b-0 hover:bg-hover-bg -mx-5 px-5 transition-fast"
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
                {todos.map((td) => (
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
                      <span className="text-base font-medium text-text-primary">
                        {r.title}
                      </span>
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
