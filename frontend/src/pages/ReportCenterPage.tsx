import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, MetricMini, Panel, Select, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiReportSnapshot, type ApiReportSummary, formatDate, formatDateTime, numberValue } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { BarChart3, CheckCircle2, Download, FileDown, RefreshCw, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

interface ReportDetail {
  report_type: string
  snapshot?: ApiReportSnapshot | null
}

interface ReportExportResult {
  id: string
  status: string
  payload: Record<string, unknown>
}

interface ReportCatalogItem {
  report_type: string
  label: string
  desc: string
  definition: string
}

interface MetricDefinition {
  label: string
  value: string
  sub: string
}

interface ChartItem {
  label: string
  value: number
  display: string
  tone: 'primary' | 'success' | 'warning' | 'error' | 'info'
}

interface ExportHistoryItem {
  id: string
  report_type: string
  generated_at: string
  file_name: string
}

const EXPORT_HISTORY_KEY = 'nexusflow.report.exportHistory'

const reportCatalog: ReportCatalogItem[] = [
  {
    report_type: 'task_overview',
    label: '任务总览',
    desc: '任务数量、状态分布、周期和风险快照',
    definition: '按当前用户可见任务聚合；周期使用任务创建时间过滤，冲突只统计 open 状态。',
  },
  {
    report_type: 'person_workload',
    label: '人员负载',
    desc: '人员工时、负载水位和冲突趋势快照',
    definition: '按当前数据范围内人员与 workload_snapshots 聚合，平均负载率以 1.0 表示 100%。',
  },
  {
    report_type: 'resource_archive',
    label: '资料归档',
    desc: '资料上传、关联、版本和归档状态快照',
    definition: '按当前用户可见资料聚合；归档完整度使用资料状态与成果标记，不使用本地文件数估算。',
  },
]

function reportMeta(type: string) {
  return reportCatalog.find((item) => item.report_type === type) ?? {
    report_type: type,
    label: type,
    desc: '系统报表快照',
    definition: '由服务器聚合并返回当前用户可见数据。',
  }
}

function loadReports() {
  return apiGet<ApiList<ApiReportSummary>>('/reports')
}

function loadReportDetail(reportType: string) {
  return apiGet<ReportDetail>(`/reports/${reportType}`)
}

function payloadRows(payload?: Record<string, unknown>) {
  return Object.entries(payload ?? {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(numberValue(value))
}

function formatRate(value: unknown) {
  return `${Math.round(numberValue(value) * 100)}%`
}

function percent(part: unknown, total: unknown) {
  const denominator = numberValue(total)
  if (denominator <= 0) return '0%'
  return `${Math.round((numberValue(part) / denominator) * 100)}%`
}

function reportMetrics(type: string, payload?: Record<string, unknown>): MetricDefinition[] {
  if (type === 'person_workload') {
    return [
      { label: '可见人员', value: formatNumber(payload?.visible_person_count), sub: 'data scope people' },
      { label: '有负载人员', value: formatNumber(payload?.workload_person_count), sub: 'with workload snapshots' },
      { label: '平均负载', value: formatRate(payload?.average_load_rate), sub: 'average load rate' },
      { label: '超载天数', value: formatNumber(payload?.overload_day_count), sub: 'load_rate > 100%' },
    ]
  }
  if (type === 'resource_archive') {
    return [
      { label: '资料总数', value: formatNumber(payload?.total_count), sub: 'visible resources' },
      { label: '归档率', value: percent(payload?.archived_count, payload?.total_count), sub: `${formatNumber(payload?.archived_count)} archived` },
      { label: '成果资料', value: formatNumber(numberValue(payload?.final_result_count) + numberValue(payload?.stage_result_count)), sub: 'final + stage results' },
      { label: '版本 / 关联', value: `${formatNumber(payload?.version_count)} / ${formatNumber(payload?.link_count)}`, sub: 'versions and links' },
    ]
  }
  return [
    { label: '任务总数', value: formatNumber(payload?.total_count), sub: 'visible tasks' },
    { label: '进行中', value: formatNumber(payload?.in_progress_count), sub: percent(payload?.in_progress_count, payload?.total_count) },
    { label: '待处理', value: formatNumber(payload?.pending_count), sub: 'review / acceptance / approval' },
    { label: '开放冲突', value: formatNumber(payload?.open_conflict_count), sub: `${formatNumber(payload?.overdue_count)} overdue` },
  ]
}

function reportChartItems(type: string, payload?: Record<string, unknown>): ChartItem[] {
  if (type === 'person_workload') {
    return [
      { label: '可见人员', value: numberValue(payload?.visible_person_count), display: formatNumber(payload?.visible_person_count), tone: 'primary' },
      { label: '有负载人员', value: numberValue(payload?.workload_person_count), display: formatNumber(payload?.workload_person_count), tone: 'info' },
      { label: '负载天数', value: numberValue(payload?.workload_day_count), display: formatNumber(payload?.workload_day_count), tone: 'success' },
      { label: '超载天数', value: numberValue(payload?.overload_day_count), display: formatNumber(payload?.overload_day_count), tone: 'error' },
      { label: '全天占用', value: numberValue(payload?.full_day_count), display: formatNumber(payload?.full_day_count), tone: 'warning' },
    ]
  }
  if (type === 'resource_archive') {
    return [
      { label: '总资料', value: numberValue(payload?.total_count), display: formatNumber(payload?.total_count), tone: 'primary' },
      { label: '已归档', value: numberValue(payload?.archived_count), display: formatNumber(payload?.archived_count), tone: 'success' },
      { label: '最终成果', value: numberValue(payload?.final_result_count), display: formatNumber(payload?.final_result_count), tone: 'info' },
      { label: '阶段成果', value: numberValue(payload?.stage_result_count), display: formatNumber(payload?.stage_result_count), tone: 'warning' },
      { label: '关联数', value: numberValue(payload?.link_count), display: formatNumber(payload?.link_count), tone: 'primary' },
    ]
  }
  return [
    { label: '进行中', value: numberValue(payload?.in_progress_count), display: formatNumber(payload?.in_progress_count), tone: 'primary' },
    { label: '待处理', value: numberValue(payload?.pending_count), display: formatNumber(payload?.pending_count), tone: 'warning' },
    { label: '已完成', value: numberValue(payload?.completed_count), display: formatNumber(payload?.completed_count), tone: 'success' },
    { label: '逾期', value: numberValue(payload?.overdue_count), display: formatNumber(payload?.overdue_count), tone: 'error' },
    { label: '开放冲突', value: numberValue(payload?.open_conflict_count), display: formatNumber(payload?.open_conflict_count), tone: 'info' },
  ]
}

function metricExplanation(key: string) {
  const map: Record<string, string> = {
    total_count: '当前权限范围内的对象总数',
    in_progress_count: '状态为进行中的任务数量',
    pending_count: '待审批、待评审或待验收的任务数量',
    completed_count: '已完成或已归档的任务数量',
    overdue_count: '已过截止时间且未完成的任务数量',
    open_conflict_count: '仍处于 open 状态的冲突数量',
    visible_person_count: '当前数据范围内可见人员数量',
    workload_person_count: '在周期内存在负载快照的人员数量',
    workload_day_count: '周期内负载快照天数',
    committed_hours: '周期内已承诺工时总和',
    average_load_rate: '平均负载率，1.0 表示 100%',
    overload_day_count: '负载率超过 100% 的日期数量',
    full_day_count: '全天占用日期数量',
    archived_count: '状态为 archived 的资料数量',
    final_result_count: '标记为最终成果的资料数量',
    stage_result_count: '标记为阶段成果的资料数量',
    version_count: '资料版本记录数量',
    link_count: '资料与任务、项目等对象的关联数量',
    generated_from: '服务端聚合来源标记',
    data_scope_applied: '是否已套用当前用户数据范围',
  }
  return map[key] ?? '服务器返回的原始指标'
}

function toneClass(tone: ChartItem['tone']) {
  const map: Record<ChartItem['tone'], string> = {
    primary: 'bg-text-primary',
    success: 'bg-color-success',
    warning: 'bg-color-warning',
    error: 'bg-color-error',
    info: 'bg-color-info',
  }
  return map[tone]
}

function loadExportHistory(): ExportHistoryItem[] {
  const raw = localStorage.getItem(EXPORT_HISTORY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, 6) as ExportHistoryItem[] : []
  } catch {
    localStorage.removeItem(EXPORT_HISTORY_KEY)
    return []
  }
}

function saveExportHistory(items: ExportHistoryItem[]) {
  localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(items.slice(0, 6)))
}

function applyPeriodPreset(value: string) {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const start = new Date(now)
  if (value === '7d') start.setDate(now.getDate() - 6)
  if (value === '30d') start.setDate(now.getDate() - 29)
  if (value === 'month') start.setDate(1)
  return { start: value === 'all' ? '' : start.toISOString().slice(0, 10), end: value === 'all' ? '' : end }
}

function downloadSnapshotPackage(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function MetricCard({ metric }: { metric: MetricDefinition }) {
  return (
    <Panel>
      <MetricMini label={metric.label} value={metric.value} />
      <div className="mt-2 text-xs text-text-muted">{metric.sub}</div>
    </Panel>
  )
}

function BarWidget({ items }: { items: ChartItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.value))
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const width = Math.max(4, Math.round((item.value / max) * 100))
        return (
          <div key={item.label} className="grid grid-cols-[92px_1fr_54px] items-center gap-3">
            <span className="text-sm text-text-muted">{item.label}</span>
            <div className="h-3 overflow-hidden rounded-sm bg-bg-tertiary">
              <div className={`h-full rounded-sm ${toneClass(item.tone)}`} style={{ width: `${width}%` }} />
            </div>
            <span className="text-right font-mono text-sm font-semibold text-text-primary">{item.display}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ReportCenterPage() {
  const [activeType, setActiveType] = useState('task_overview')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [periodPreset, setPeriodPreset] = useState('all')
  const [message, setMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [history, setHistory] = useState<ExportHistoryItem[]>(() => loadExportHistory())
  const { data, loading, error, reload } = useApiData(loadReports)
  const detailState = useApiData(() => loadReportDetail(activeType), [activeType])
  const summaries = useMemo(() => data?.items ?? [], [data?.items])
  const reportTypes = reportCatalog
  const activeSummary = summaries.find((item) => item.report_type === activeType)
  const snapshot = detailState.data?.snapshot
  const payload = snapshot?.payload
  const rows = payloadRows(payload)
  const meta = reportMeta(activeType)
  const metrics = reportMetrics(activeType, payload)
  const chartItems = reportChartItems(activeType, payload)
  const generatedFrom = typeof payload?.generated_from === 'string' ? payload.generated_from : 'server_aggregate'
  const scopeApplied = payload?.data_scope_applied === true

  function updatePreset(value: string) {
    setPeriodPreset(value)
    const next = applyPeriodPreset(value)
    setPeriodStart(next.start)
    setPeriodEnd(next.end)
  }

  async function exportSnapshot() {
    setMessage(null)
    setExporting(true)
    try {
      const result = await apiPost<ReportExportResult>(`/reports/${activeType}/export`, {
        scope_type: 'user',
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
        report_type: activeType,
      })
      const generatedAt = new Date().toISOString()
      const fileName = `nexusflow-${activeType}-${generatedAt.slice(0, 10)}-${result.id.slice(0, 8)}.json`
      const downloadPayload = {
        report_type: activeType,
        snapshot_id: result.id,
        generated_at: generatedAt,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        payload: result.payload,
      }
      downloadSnapshotPackage(fileName, downloadPayload)
      const nextHistory = [{ id: result.id, report_type: activeType, generated_at: generatedAt, file_name: fileName }, ...history]
      setHistory(nextHistory.slice(0, 6))
      saveExportHistory(nextHistory)
      await Promise.all([reload(), detailState.reload()])
      setMessage('报表快照已生成并下载')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '生成报表失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <MainLayout title="报表" subtitle="服务器聚合快照、趋势摘要与权限内导出">
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
          <Panel title="报表库">
            <div className="flex flex-col gap-2">
              {reportTypes.map((item) => {
                const active = item.report_type === activeType
                const summary = summaries.find((summaryItem) => summaryItem.report_type === item.report_type)
                return (
                  <button
                    key={item.report_type}
                    className={active ? 'rounded-md border border-primary-fill bg-text-primary p-3 text-left text-primary-text' : 'rounded-md border border-border-subtle bg-bg-secondary p-3 text-left transition-fast hover:bg-hover-bg'}
                    onClick={() => {
                      setActiveType(item.report_type)
                      setMessage(null)
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={active ? 'text-sm font-semibold text-primary-text' : 'text-sm font-semibold text-text-primary'}>{item.label}</span>
                      <Badge className={active ? 'bg-white/15 text-primary-text' : undefined}>{formatNumber(summary?.count)} 份</Badge>
                    </div>
                    <div className={active ? 'mt-2 text-xs leading-5 text-white/70' : 'mt-2 text-xs leading-5 text-text-muted'}>{item.desc}</div>
                    <div className={active ? 'mt-3 text-xs text-white/55' : 'mt-3 text-xs text-text-muted'}>最新 {formatDateTime(summary?.latest)}</div>
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel title="Dashboard 筛选">
            <div className="flex flex-col gap-3">
              <Select
                label="时间范围"
                value={periodPreset}
                onChange={(event) => updatePreset(event.target.value)}
                options={[
                  { value: 'all', label: '全部时间' },
                  { value: '7d', label: '近 7 天' },
                  { value: '30d', label: '近 30 天' },
                  { value: 'month', label: '本月' },
                ]}
              />
              <Input label="开始日期" type="date" value={periodStart} onChange={(event) => { setPeriodPreset('custom'); setPeriodStart(event.target.value) }} />
              <Input label="结束日期" type="date" value={periodEnd} onChange={(event) => { setPeriodPreset('custom'); setPeriodEnd(event.target.value) }} />
              <div className="rounded-md bg-bg-tertiary px-3 py-2 text-xs leading-5 text-text-muted">
                导出时由后端按当前用户权限重新聚合，前端筛选不会提升数据范围。
              </div>
            </div>
          </Panel>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto">
          {(error || detailState.error || message) && (
            <div className={error || detailState.error || message?.includes('失败') ? 'rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error' : 'rounded-md bg-color-success-bg px-4 py-3 text-sm text-color-success'}>
              {error || detailState.error || message}
            </div>
          )}

          <Panel
            title={meta.label}
            right={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" onClick={() => void detailState.reload()}>
                  <RefreshCw className="h-4 w-4" />
                  刷新
                </Button>
                <Button className="h-9 px-3 py-0 text-sm" disabled={exporting} onClick={() => void exportSnapshot()}>
                  <Download className="h-4 w-4" />
                  {exporting ? '生成中' : '生成并下载'}
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="text-sm leading-6 text-text-secondary">{meta.desc}</div>
                <div className="mt-1 text-xs leading-5 text-text-muted">{meta.definition}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{generatedFrom}</Badge>
                <Badge className={scopeApplied ? 'bg-color-success-bg text-color-success' : 'bg-color-warning-bg text-color-warning'}>
                  {scopeApplied ? '已应用权限范围' : '缺少权限标记'}
                </Badge>
                <Badge>{formatNumber(activeSummary?.count)} 份历史快照</Badge>
                <Badge>{formatDate(snapshot?.period_start)} - {formatDate(snapshot?.period_end)}</Badge>
              </div>
            </div>
          </Panel>

          {detailState.loading || loading ? (
            <Panel className="min-h-[420px]">
              <div className="py-16 text-center text-sm text-text-muted">加载中...</div>
            </Panel>
          ) : !snapshot ? (
            <Panel className="min-h-[420px]">
              <EmptyState title="暂无快照" desc="该报表尚未生成快照，可选择周期后生成并下载一次。" />
            </Panel>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <Panel title="专项分布图">
                  <BarWidget items={chartItems} />
                </Panel>
                <Panel title="快照质量">
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex items-center gap-3 rounded-md bg-bg-tertiary px-3 py-2">
                      <ShieldCheck className="h-4 w-4 text-color-success" />
                      <span className="text-text-secondary">服务器按当前账号重新校验数据范围。</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-md bg-bg-tertiary px-3 py-2">
                      <BarChart3 className="h-4 w-4 text-color-info" />
                      <span className="text-text-secondary">图表由 snapshot payload 渲染，不做本地再统计。</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-md bg-bg-tertiary px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 text-color-success" />
                      <span className="text-text-secondary">生成时间：{formatDateTime(snapshot.generated_at)}</span>
                    </div>
                  </div>
                </Panel>
              </div>

              <Panel title="原始指标表" className="min-h-[320px]">
                {rows.length === 0 ? (
                  <pre className="max-h-[360px] overflow-auto rounded-md bg-bg-tertiary p-4 text-xs text-text-secondary">
                    {JSON.stringify(snapshot.payload ?? {}, null, 2)}
                  </pre>
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th className="w-[220px]">指标</Th>
                        <Th className="w-[160px]">值</Th>
                        <Th>口径说明</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {rows.map(([key, value]) => (
                        <Tr key={key}>
                          <Td className="w-[220px] font-mono text-xs">{key}</Td>
                          <Td className="w-[160px]">{String(value)}</Td>
                          <Td>{metricExplanation(key)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </Panel>

              <Panel title="下载记录">
                {history.length === 0 ? (
                  <div className="text-sm text-text-muted">本机尚无报表下载记录。</div>
                ) : (
                  <div className="flex flex-col divide-y divide-border-subtle">
                    {history.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-primary">{item.file_name}</div>
                          <div className="text-xs text-text-muted">{reportMeta(item.report_type).label} · {formatDateTime(item.generated_at)}</div>
                        </div>
                        <FileDown className="h-4 w-4 shrink-0 text-text-muted" />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          )}
        </section>
      </div>
    </MainLayout>
  )
}
