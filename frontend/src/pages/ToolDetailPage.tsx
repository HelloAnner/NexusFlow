import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, MetricMini, Panel, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiTool, type ApiToolUsage, formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface ToolDetailData {
  tool: ApiTool
  usage: ApiList<ApiToolUsage>
}

function loadToolDetail(id: string) {
  return Promise.all([
    apiGet<ApiTool>(`/tools/${id}`),
    apiGet<ApiList<ApiToolUsage>>(`/tools/${id}/usage`),
  ]).then(([tool, usage]) => ({ tool, usage }))
}

export function ToolDetailPage() {
  const { id } = useParams()
  const [message, setMessage] = useState<string | null>(null)
  const [context, setContext] = useState<Record<string, unknown> | null>(null)
  const { data, loading, error, reload } = useApiData<ToolDetailData>(() => loadToolDetail(id ?? ''), [id])
  const tool = data?.tool
  const usage = data?.usage.items ?? []

  async function openTool() {
    if (!tool) return
    setMessage(null)
    try {
      await apiPost(`/tools/${tool.id}/usage`, { source_type: 'manual' })
      await reload()
      if (tool.entry_url) window.open(tool.entry_url, '_blank', 'noopener,noreferrer')
      else setMessage('已记录使用，当前工具未配置入口地址。')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '打开工具失败')
    }
  }

  async function loadContext() {
    if (!tool) return
    setMessage(null)
    try {
      setContext(await apiPost<Record<string, unknown>>(`/tools/${tool.id}/context`, { source_type: 'manual' }))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '获取上下文失败')
    }
  }

  return (
    <MainLayout title={tool?.name ?? '工具详情'} subtitle={tool?.description ?? '工具配置、上下文和使用记录'}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link to="/tools" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
            <ArrowLeft className="h-4 w-4" />
            返回工具台
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="h-9 px-3 py-0 text-sm" onClick={() => void reload()}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Button className="h-9 px-3 py-0 text-sm" onClick={() => void openTool()} disabled={!tool}>
              <ExternalLink className="h-4 w-4" />
              打开工具
            </Button>
          </div>
        </div>

        {(error || message) && (
          <div className={error ? 'rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error' : 'rounded-md bg-color-info-bg px-4 py-3 text-sm text-color-info'}>
            {error || message}
          </div>
        )}

        {!loading && !tool ? (
          <EmptyState title="工具不存在" desc="该工具可能已停用或不可见。" />
        ) : (
          <div className="grid grid-cols-[1fr_360px] gap-6">
            <section className="flex min-w-0 flex-col gap-5">
              <div className="grid grid-cols-4 gap-4">
                <Panel title="分类"><MetricMini label="category" value={tool?.category ?? '-'} /></Panel>
                <Panel title="入口类型"><MetricMini label="entry type" value={tool?.entry_type ?? '-'} /></Panel>
                <Panel title="状态"><MetricMini label="enabled" value={tool?.enabled ? '启用' : '停用'} /></Panel>
                <Panel title="使用次数"><MetricMini label="usage logs" value={usage.length} /></Panel>
              </div>

              <Panel title="工具信息">
                <div className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
                  <span className="text-text-muted">工具名称</span>
                  <span className="text-text-primary">{tool?.name ?? '-'}</span>
                  <span className="text-text-muted">入口地址</span>
                  <span className="break-all text-text-primary">{tool?.entry_url || '未配置'}</span>
                  <span className="text-text-muted">描述</span>
                  <span className="text-text-primary">{tool?.description || '暂无描述'}</span>
                  <span className="text-text-muted">图标</span>
                  <span className="text-text-primary">{tool?.icon || String(tool?.payload?.icon ?? '-')}</span>
                </div>
              </Panel>

              <Panel title="使用记录">
                {usage.length === 0 ? (
                  <EmptyState title="暂无使用记录" desc="该工具还没有可见使用记录。" />
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th className="w-[180px]">使用时间</Th>
                        <Th className="w-[140px]">来源</Th>
                        <Th>来源 ID</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {usage.map((item) => (
                        <Tr key={item.id}>
                          <Td className="w-[180px]">{formatDateTime(item.used_at)}</Td>
                          <Td className="w-[140px]"><Badge>{item.source_type ?? 'manual'}</Badge></Td>
                          <Td>{item.source_id ?? '-'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </Panel>
            </section>

            <aside className="flex flex-col gap-5">
              <Panel
                title="上下文"
                right={
                  <Button variant="secondary" className="h-8 px-3 py-0 text-sm" onClick={() => void loadContext()} disabled={!tool}>
                    获取
                  </Button>
                }
              >
                {context ? (
                  <pre className="max-h-[320px] overflow-auto rounded-md bg-bg-tertiary p-3 text-xs text-text-secondary">
                    {JSON.stringify(context, null, 2)}
                  </pre>
                ) : (
                  <div className="text-sm text-text-muted">当前按 manual 来源获取安全上下文，不包含敏感业务数据。</div>
                )}
              </Panel>

              <Panel title="管理入口">
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-text-secondary">工具可见范围、角色权限与首页推荐仍由配置中心维护。</p>
                  <Link to="/config" className="inline-flex">
                    <Button variant="secondary" className="h-9 px-3 py-0 text-sm">进入配置中心</Button>
                  </Link>
                </div>
              </Panel>
            </aside>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
