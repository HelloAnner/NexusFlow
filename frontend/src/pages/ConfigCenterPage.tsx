import { MainLayout } from '@/components/layout'
import { Badge, EmptyState, Panel, SearchInput, Tag } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { type ApiConflict, type ApiList, type ApiTask, formatDateTime, taskStatusLabel, taskStatusVariant } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

interface ConfigVersion {
  id: string
  namespace: string
  version_no: number
  status: string
  created_at?: string
  published_at?: string | null
}

interface RuntimeStatus {
  status?: string
  database?: boolean
  redis?: boolean
  s3_configured?: boolean
  search_backend?: string
  uptime_seconds?: number
}

interface ConfigData {
  modules: { modules: string[] }
  versions: ApiList<ConfigVersion>
  runtime: RuntimeStatus
  tasks: ApiList<ApiTask>
  todos: ApiList<{ id: string; title: string; todo_type?: string; action_url?: string }>
  conflicts: ApiList<ApiConflict>
}

const menuLabels: Record<string, string> = {
  task_template: '任务模板',
  approval_rule: '审批规则',
  alert_rule: '告警规则',
  view_config: '首页视图',
  tool_config: '工具配置',
  invitation_policy: '邀请注册',
  role_entry: '角色入口',
}

async function loadConfigData() {
  const [modules, versions, runtime, tasks, todos, conflicts] = await Promise.all([
    apiGet<ConfigData['modules']>('/config/modules'),
    apiGet<ApiList<ConfigVersion>>('/config/versions'),
    apiGet<RuntimeStatus>('/config/runtime-status').catch((): RuntimeStatus => ({ status: 'forbidden' })),
    apiGet<ApiList<ApiTask>>('/tasks', { page_size: 5 }),
    apiGet<ConfigData['todos']>('/todos', { status: 'open', page_size: 5 }),
    apiGet<ApiList<ApiConflict>>('/conflicts', { status: 'open', page_size: 5 }),
  ])
  return { modules, versions, runtime, tasks, todos, conflicts }
}

export function ConfigCenterPage() {
  const [activeMenu, setActiveMenu] = useState('task_template')
  const [q, setQ] = useState('')
  const { data, loading, error } = useApiData(loadConfigData)
  const modules = data?.modules.modules ?? []
  const versions = (data?.versions.items ?? []).filter((version) => version.namespace.includes(q))
  const activeVersions = versions.filter((version) => activeMenu === version.namespace)
  const published = versions.filter((version) => version.status === 'published').length
  const draft = versions.filter((version) => version.status === 'draft').length

  return (
    <MainLayout title="设置" subtitle="流程、权限、通知与系统设置">
      <div className="flex h-full min-h-0 flex-col gap-4">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2.5">
          <SearchInput placeholder="搜索配置项..." className="w-full bg-bg-tertiary sm:w-80" value={q} onChange={(event) => setQ(event.target.value)} />
          <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-none sm:items-center sm:gap-3">
            <Metric label="配置模块" value={modules.length} />
            <Metric label="已发布" value={published} />
            <Metric label="草稿" value={draft} />
            <Metric label="运行状态" value={data?.runtime.status ?? '未知'} />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[220px_1fr]">
          <div className="flex min-h-0 flex-col gap-1 overflow-auto rounded-md border border-border-subtle bg-bg-secondary p-2">
            {modules.map((item) => (
              <button
                key={item}
                onClick={() => setActiveMenu(item)}
                className={cn('w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-fast', activeMenu === item ? 'bg-primary-fill text-primary-text' : 'text-text-muted hover:bg-hover-bg hover:text-text-primary')}
              >
                {menuLabels[item] ?? item}
              </button>
            ))}
          </div>

          <div className="grid min-h-0 gap-4 lg:grid-cols-[1fr_300px]">
            <Panel title={menuLabels[activeMenu] ?? activeMenu} className="overflow-hidden">
              {activeVersions.length === 0 && !loading ? (
                <EmptyState title="暂无配置版本" desc="该模块尚未创建配置版本。" />
              ) : (
                <div className="flex flex-col">
                  {activeVersions.map((version) => (
                    <div key={version.id} className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-medium text-text-primary">版本 {version.version_no}</span>
                        <span className="text-sm text-text-muted">创建 {formatDateTime(version.created_at)} · 发布 {formatDateTime(version.published_at)}</span>
                      </div>
                      <Tag variant={version.status === 'published' ? 'success' : version.status === 'draft' ? 'warning' : 'info'}>{version.status}</Tag>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="系统运行状态">
              <div className="flex flex-col divide-y divide-border-subtle">
                <Status label="数据库" ok={data?.runtime.database} />
                <Status label="Redis" ok={data?.runtime.redis} />
                <Status label="对象存储" ok={data?.runtime.s3_configured} />
                <div className="flex items-center justify-between py-3">
                  <span className="text-base text-text-primary">搜索后端</span>
                  <Badge>{data?.runtime.search_backend ?? 'unknown'}</Badge>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <Panel
            title="我的任务"
            right={<Link to="/tasks" className="flex items-center text-sm text-text-muted hover:text-text-primary">查看全部 <ChevronRight className="h-4 w-4" /></Link>}
          >
            <div className="flex flex-col">
              {(data?.tasks.items ?? []).map((task) => (
                <Link key={task.id} to={`/tasks/${task.id}`} className="-mx-4 flex items-center justify-between border-b border-border-subtle px-4 py-3 transition-fast last:border-b-0 hover:bg-hover-bg">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-text-primary">{task.name}</span>
                    <span className="text-xs text-text-muted">截止 {formatDateTime(task.due_at)}</span>
                  </div>
                  <Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag>
                </Link>
              ))}
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title="我的待办">
              {(data?.todos.items ?? []).map((todo) => (
                <Link key={todo.id} to={todo.action_url || '/tasks'} className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0">
                  <span className="text-base text-text-primary">{todo.title}</span>
                  <Badge>{todo.todo_type ?? '待办'}</Badge>
                </Link>
              ))}
            </Panel>
            <Panel title="风险提醒">
              {(data?.conflicts.items ?? []).map((conflict) => (
                <div key={conflict.id} className="flex items-center justify-between border-b border-border-subtle py-4 last:border-b-0">
                  <span className="text-base font-medium text-text-primary">{conflict.task_id ?? '冲突记录'}</span>
                  <span className="text-sm text-color-error">{conflict.risk_level ?? 'risk'}</span>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-bg-tertiary px-3 py-2">
      <span className="block text-xs text-text-muted">{label}</span>
      <span className="mt-0.5 block text-sm font-semibold text-text-primary">{value}</span>
    </div>
  )
}

function Status({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-base text-text-primary">{label}</span>
      <Tag variant={ok ? 'success' : 'warning'}>{ok ? '正常' : '未配置'}</Tag>
    </div>
  )
}
