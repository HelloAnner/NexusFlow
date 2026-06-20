import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, MetricMini, Panel, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiReportSnapshot, type ApiReportSummary, formatDate, formatDateTime, numberValue } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Download, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'

interface ReportDetail {
  report_type: string
  snapshot?: ApiReportSnapshot | null
}

const defaultReports = [
  { report_type: 'task_overview', label: '任务总览', desc: '任务数量、状态分布、周期和风险快照' },
  { report_type: 'person_workload', label: '人员负载', desc: '人员工时、负载水位和冲突趋势快照' },
  { report_type: 'resource_archive', label: '资料归档', desc: '资料上传、关联、版本和归档状态快照' },
]

function reportLabel(type: string) {
  return defaultReports.find((item) => item.report_type === type)?.label ?? type
}

function reportDesc(type: string) {
  return defaultReports.find((item) => item.report_type === type)?.desc ?? '系统报表快照'
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

export function ReportCenterPage() {
  const [activeType, setActiveType] = useState('task_overview')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(loadReports)
  const detailState = useApiData(() => loadReportDetail(activeType), [activeType])
  const summaries = useMemo(() => data?.items ?? [], [data?.items])
  const reportTypes = useMemo(() => {
    const merged = new Map(defaultReports.map((item) => [item.report_type, item]))
    summaries.forEach((item) => {
      if (!merged.has(item.report_type)) merged.set(item.report_type, { report_type: item.report_type, label: item.report_type, desc: '系统报表快照' })
    })
    return [...merged.values()]
  }, [summaries])
  const activeSummary = summaries.find((item) => item.report_type === activeType)
  const snapshot = detailState.data?.snapshot
  const rows = payloadRows(snapshot?.payload)

  async function exportSnapshot() {
    setMessage(null)
    try {
      await apiPost(`/reports/${activeType}/export`, {
        scope_type: 'user',
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
        report_type: activeType,
      })
      await Promise.all([reload(), detailState.reload()])
      setMessage('报表快照已生成')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '生成报表失败')
    }
  }

  return (
    <MainLayout title="报表" subtitle="任务、人员与资料的统计快照">
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="flex min-h-0 flex-col gap-2 overflow-auto">
          {reportTypes.map((item) => {
            const active = item.report_type === activeType
            const summary = summaries.find((summaryItem) => summaryItem.report_type === item.report_type)
            return (
              <button
                key={item.report_type}
                className={active ? 'rounded-md border border-primary-fill bg-bg-secondary p-3 text-left' : 'rounded-md border border-border-subtle bg-bg-secondary p-3 text-left transition-fast hover:bg-hover-bg'}
                onClick={() => setActiveType(item.report_type)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-text-primary">{item.label}</span>
                  <Badge>{numberValue(summary?.count)} 份</Badge>
                </div>
                <div className="mt-2 text-xs leading-5 text-text-muted">{item.desc}</div>
                <div className="mt-3 text-xs text-text-muted">最新 {formatDateTime(summary?.latest)}</div>
              </button>
            )
          })}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto">
          {(error || detailState.error || message) && (
            <div className={error || detailState.error ? 'rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error' : 'rounded-md bg-color-success-bg px-4 py-3 text-sm text-color-success'}>
              {error || detailState.error || message}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Panel title="报表类型"><MetricMini label={activeType} value={reportLabel(activeType)} /></Panel>
            <Panel title="历史快照"><MetricMini label="snapshot count" value={numberValue(activeSummary?.count)} /></Panel>
            <Panel title="最新生成"><MetricMini label="generated at" value={formatDateTime(activeSummary?.latest)} /></Panel>
            <Panel title="统计周期"><MetricMini label="period" value={`${formatDate(snapshot?.period_start)} - ${formatDate(snapshot?.period_end)}`} /></Panel>
          </div>

          <Panel
            title={reportLabel(activeType)}
            right={
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" onClick={() => void detailState.reload()}>
                  <RefreshCw className="h-4 w-4" />
                  刷新
                </Button>
                <Button className="h-9 px-3 py-0 text-sm" onClick={() => void exportSnapshot()}>
                  <Download className="h-4 w-4" />
                  生成快照
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_180px]">
              <Input label="开始日期" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              <Input label="结束日期" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              <div className="flex flex-col justify-end rounded-md bg-bg-tertiary px-3 py-2 text-xs leading-5 text-text-muted">{reportDesc(activeType)}</div>
            </div>
          </Panel>

          <Panel title="最新快照详情" className="min-h-[320px] flex-1">
            {detailState.loading || loading ? (
              <div className="py-10 text-center text-sm text-text-muted">加载中...</div>
            ) : !snapshot ? (
              <EmptyState title="暂无快照" desc="该报表尚未生成快照，可按需要生成一次。" />
            ) : rows.length === 0 ? (
              <pre className="max-h-[360px] overflow-auto rounded-md bg-bg-tertiary p-4 text-xs text-text-secondary">
                {JSON.stringify(snapshot.payload ?? {}, null, 2)}
              </pre>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th className="w-[220px]">指标</Th>
                    <Th>值</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map(([key, value]) => (
                    <Tr key={key}>
                      <Td className="w-[220px]">{key}</Td>
                      <Td>{String(value)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Panel>
        </section>
      </div>
    </MainLayout>
  )
}
