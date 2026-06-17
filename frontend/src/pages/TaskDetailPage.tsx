import { MainLayout } from '@/components/layout'
import { Tag, AvatarGroup, Panel, ProgressBar, TimelineItem, Tabs, Button } from '@/components/ui'
import { taskDetail } from '@/mocks/taskDetail'
import { ChevronRight, Pencil, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const tabs = [
  { value: 'overview', label: '概览' },
  { value: 'division', label: '分工' },
  { value: 'gantt', label: '甘特图' },
  { value: 'resources', label: '资料' },
  { value: 'approval', label: '审批' },
  { value: 'logs', label: '日志' },
]

const statusColorMap: Record<string, string> = {
  已完成: 'text-color-success',
  进行中: 'text-color-warning',
  待开始: 'text-text-muted',
}

export function TaskDetailPage() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <MainLayout title="任务详情" subtitle={taskDetail.title}>
      <div className="flex flex-col gap-6">
        {/* Breadcrumb + Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Link to="/tasks" className="hover:text-text-primary transition-fast">
              任务
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="hover:text-text-primary transition-fast cursor-pointer">
              {taskDetail.project}
            </span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-text-primary">{taskDetail.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="h-9 px-4">
              <Pencil className="h-4 w-4" />
              编辑
            </Button>
            <Button variant="primary" className="h-9 px-4">
              <Upload className="h-4 w-4" />
              提交成果
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

        {/* Detail Content */}
        <div className="grid grid-cols-[1fr_360px] gap-6">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {/* Detail Header */}
            <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-3">
                  <Tag variant={taskDetail.statusVariant}>{taskDetail.status}</Tag>
                  <h2 className="text-2xl font-semibold text-text-primary">{taskDetail.title}</h2>
                  <span className="text-sm text-text-muted">
                    创建于 {taskDetail.createdAt} · 最后更新 {taskDetail.updatedAt}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <Tag variant={taskDetail.riskVariant}>风险 {taskDetail.risk}</Tag>
                  <AvatarGroup names={taskDetail.members} />
                </div>
              </div>
            </div>

            {/* Description */}
            <Panel title="任务描述">
              <p className="text-base leading-relaxed text-text-secondary">
                {taskDetail.description}
              </p>
            </Panel>

            {/* Subtasks */}
            <Panel title="子任务">
              <div className="flex flex-col">
                {taskDetail.subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          sub.status === '已完成'
                            ? 'border-color-success bg-color-success'
                            : 'border-border-subtle bg-bg-secondary'
                        }`}
                      >
                        {sub.status === '已完成' && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-base text-text-primary">{sub.title}</span>
                    </div>
                    <span className={`text-sm font-medium ${statusColorMap[sub.status]}`}>
                      {sub.status}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Timeline */}
            <Panel title="最新动态">
              <div className="flex flex-col">
                {taskDetail.timeline.map((event) => (
                  <TimelineItem
                    key={event.id}
                    title={event.title}
                    desc={event.desc}
                    time={event.time}
                  />
                ))}
              </div>
            </Panel>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-6">
            <Panel title="基本信息">
              <div className="flex flex-col">
                <InfoRow label="负责人" value={taskDetail.owner} />
                <InfoRow label="项目" value={taskDetail.project} />
                <InfoRow label="类型" value={taskDetail.type} />
                <InfoRow label="优先级" value={taskDetail.priority} valueClass="text-color-error" />
                <InfoRow label="开始时间" value={taskDetail.start} />
                <InfoRow label="截止时间" value={taskDetail.end} />
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-text-muted">进度</span>
                  <div className="flex w-40 items-center gap-3">
                    <span className="text-sm font-medium text-text-primary">{taskDetail.progress}%</span>
                    <ProgressBar value={taskDetail.progress} />
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

function InfoRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className={`text-base font-medium text-text-primary ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}
