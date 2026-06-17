import { MainLayout } from '@/components/layout'
import { cn } from '@/lib/utils'
import {
  ganttDimensionTabs,
  ganttGranularityOptions,
  ganttItems,
  ganttStartDate,
  ganttToday,
  ganttWeeks,
  type GanttDimension,
  type GanttGranularity,
} from '@/mocks/gantt'
import { useState } from 'react'

const TREE_COL_WIDTHS = [140, 60, 60, 60, 40] // 任务名称、负责人、开始、截止、进度
const WEEK_COL_WIDTH = 44
const WEEK_COUNT = ganttWeeks.length

function parseDate2025(mmdd: string): Date {
  const [m, d] = mmdd.split('/').map(Number)
  return new Date(2025, m - 1, d)
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((b.getTime() - a.getTime()) / msPerDay)
}

function dateToPercent(date: Date): number {
  const days = daysBetween(ganttStartDate, date)
  const weeks = days / 7
  return (weeks / WEEK_COUNT) * 100
}

function formatProgress(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value)}%`
}

export function GanttChartPage() {
  const [dimension, setDimension] = useState<GanttDimension>('project')
  const [granularity, setGranularity] = useState<GanttGranularity>('week')
  const [riskOnly, setRiskOnly] = useState(false)

  const todayPct = dateToPercent(ganttToday)

  return (
    <MainLayout title="甘特图" subtitle="项目与任务时间线">
      <div className="flex flex-col gap-4">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center gap-1 rounded-md bg-bg-secondary p-1">
              {ganttDimensionTabs.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setDimension(t.value)}
                  className={cn(
                    'rounded-sm px-4 py-1.5 text-sm transition-fast',
                    dimension === t.value
                      ? 'bg-primary-fill font-semibold text-primary-text'
                      : 'text-text-muted hover:bg-hover-bg'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-md bg-bg-secondary p-1">
              {ganttGranularityOptions.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGranularity(g.value)}
                  className={cn(
                    'rounded-sm px-3 py-1.5 text-sm transition-fast',
                    granularity === g.value
                      ? 'bg-primary-fill font-semibold text-primary-text'
                      : 'text-text-muted hover:bg-hover-bg'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-text-muted">2025年5月 - 8月</span>
            <button
              onClick={() => setRiskOnly((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-fast',
                riskOnly ? 'bg-color-error-bg text-color-error' : 'text-text-muted hover:bg-hover-bg'
              )}
            >
              <span className="h-2 w-2 rounded-full bg-color-error" />
              只看风险
            </button>
          </div>
        </div>

        {/* Gantt */}
        <div className="flex overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
          {/* Left Tree */}
          <div className="flex w-[360px] flex-col border-r border-border-subtle">
            {/* Tree Header */}
            <div className="flex h-10 items-center border-b border-border-subtle bg-bg-tertiary text-xs text-text-muted">
              <div className="flex items-center px-3" style={{ width: TREE_COL_WIDTHS[0] }}>
                任务名称
              </div>
              <div className="flex items-center px-2" style={{ width: TREE_COL_WIDTHS[1] }}>
                负责人
              </div>
              <div className="flex items-center px-2" style={{ width: TREE_COL_WIDTHS[2] }}>
                开始
              </div>
              <div className="flex items-center px-2" style={{ width: TREE_COL_WIDTHS[3] }}>
                截止
              </div>
              <div className="flex items-center px-2" style={{ width: TREE_COL_WIDTHS[4] }}>
                进度
              </div>
            </div>

            {/* Tree Rows */}
            <div className="flex flex-col overflow-y-auto">
              {ganttItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex h-8 items-center border-b border-border-subtle text-sm last:border-b-0',
                    item.isGroup ? 'bg-bg-secondary font-medium' : 'bg-bg-primary hover:bg-hover-bg'
                  )}
                >
                  <div
                    className="flex items-center truncate px-3 text-text-primary"
                    style={{ width: TREE_COL_WIDTHS[0], paddingLeft: item.level > 0 ? 24 : 12 }}
                  >
                    {item.name}
                  </div>
                  <div
                    className="flex items-center truncate px-2 text-text-secondary"
                    style={{ width: TREE_COL_WIDTHS[1] }}
                  >
                    {item.owner ?? '—'}
                  </div>
                  <div
                    className="flex items-center px-2 text-text-secondary"
                    style={{ width: TREE_COL_WIDTHS[2] }}
                  >
                    {item.start}
                  </div>
                  <div
                    className="flex items-center px-2 text-text-secondary"
                    style={{ width: TREE_COL_WIDTHS[3] }}
                  >
                    {item.end}
                  </div>
                  <div
                    className="flex items-center px-2 text-text-secondary"
                    style={{ width: TREE_COL_WIDTHS[4] }}
                  >
                    {formatProgress(item.progress)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Timeline */}
          <div className="flex flex-1 flex-col overflow-auto">
            {/* Timeline Header */}
            <div className="flex h-10 shrink-0 border-b border-border-subtle bg-bg-tertiary">
              {ganttWeeks.map((week) => (
                <div
                  key={week}
                  className="flex items-center justify-center border-r border-border-subtle text-xs text-text-muted last:border-r-0"
                  style={{ minWidth: WEEK_COL_WIDTH }}
                >
                  {week}
                </div>
              ))}
            </div>

            {/* Timeline Rows */}
            <div className="relative flex flex-col">
              {/* Grid lines */}
              <div className="pointer-events-none absolute inset-0 flex">
                {Array.from({ length: WEEK_COUNT }).map((_, i) => (
                  <div
                    key={i}
                    className="border-r border-border-subtle last:border-r-0"
                    style={{ minWidth: WEEK_COL_WIDTH }}
                  />
                ))}
              </div>

              {/* Today line */}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-color-error"
                style={{ left: `${todayPct}%` }}
              />

              {ganttItems.map((item) => {
                const start = parseDate2025(item.start)
                const end = parseDate2025(item.end)
                const left = dateToPercent(start)
                const right = dateToPercent(end)
                const width = Math.max(right - left, 0.5)

                return (
                  <div
                    key={item.id}
                    className="relative h-8 border-b border-border-subtle last:border-b-0"
                    style={{ minWidth: WEEK_COL_WIDTH * WEEK_COUNT }}
                  >
                    {item.isMilestone ? (
                      <div
                        className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-primary-fill"
                        style={{ left: `${left}%` }}
                        title={`${item.name} ${item.start}`}
                      />
                    ) : (
                      <>
                        {/* Background bar */}
                        <div
                          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-bg-tertiary"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                        {/* Progress fill */}
                        {item.progress !== null && (
                          <div
                            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary-fill"
                            style={{ left: `${left}%`, width: `${width * (item.progress / 100)}%` }}
                          />
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-6 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary-fill" />
            <span>已完成进度</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-color-error" />
            <span>风险</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rotate-45 bg-primary-fill" />
            <span>里程碑</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-0.5 bg-color-error" />
            <span>今天</span>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
