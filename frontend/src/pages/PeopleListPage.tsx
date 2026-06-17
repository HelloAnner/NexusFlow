import { MainLayout } from '@/components/layout'
import { Avatar } from '@/components/ui'
import { people, peopleFilters, peopleStats, type Person } from '@/mocks/people'
import { ChevronDown } from 'lucide-react'

function loadColorClass(load: number): string {
  if (load >= 100) return 'bg-load-over'
  if (load >= 90) return 'bg-load-high'
  if (load >= 80) return 'bg-load-medium'
  return 'bg-load-low'
}

function StatusTag({
  variant,
  children,
}: {
  variant: 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
}) {
  const map = {
    success: 'bg-color-success-bg text-color-success',
    warning: 'bg-color-warning-bg text-color-warning',
    error: 'bg-color-error-bg text-color-error',
    info: 'bg-color-info-bg text-color-info',
  }
  return (
    <span
      className={`inline-flex w-20 items-center justify-center rounded-sm px-3 py-1 text-xs font-medium ${map[variant]}`}
    >
      {children}
    </span>
  )
}

function SkillBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center rounded-sm bg-hover-bg px-3 py-1 text-xs font-medium text-text-muted">
      {children}
    </span>
  )
}

function WorkStatusTag({ status }: { status: Person['workStatus'] }) {
  const variant = status === '在岗' ? 'success' : status === '出差' ? 'warning' : 'error'
  return <StatusTag variant={variant}>{status}</StatusTag>
}

function AccountStatusTag({ status }: { status: Person['accountStatus'] }) {
  const variant = status === '启用' ? 'success' : 'error'
  return <StatusTag variant={variant}>{status}</StatusTag>
}

export function PeopleListPage() {
  return (
    <MainLayout title="人员" subtitle="部门人员与负载状态">
      <div className="flex flex-col gap-8">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-5">
          {peopleStats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-secondary p-7"
            >
              <span className="text-sm text-text-secondary">{s.label}</span>
              <span className="text-3xl font-semibold text-text-primary">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {peopleFilters.map((f) => (
              <button
                key={f}
                className="inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-5 py-4 text-sm text-text-secondary transition-fast hover:bg-hover-bg"
              >
                {f}
                <ChevronDown className="h-2.5 w-2.5 text-text-muted" />
              </button>
            ))}
          </div>
          <button className="inline-flex items-center rounded-md border border-border-subtle bg-bg-secondary px-7 py-5 text-base font-medium text-text-muted transition-fast hover:bg-hover-bg">
            更多筛选
          </button>
        </div>

        {/* Table */}
        <div className="flex flex-1 flex-col rounded-lg border border-border-subtle bg-bg-secondary">
          {/* Header */}
          <div className="flex items-center gap-5 bg-bg-tertiary px-7 py-5 text-sm font-medium text-text-muted">
            <div className="w-[120px]">姓名</div>
            <div className="flex-1">主组织</div>
            <div className="flex-1">角色</div>
            <div className="flex-1">人员等级</div>
            <div className="w-[140px]">技能标签</div>
            <div className="flex-1">当前任务</div>
            <div className="w-[110px]">本周负载</div>
            <div className="w-[80px]">工作状态</div>
            <div className="w-[80px]">账号状态</div>
            <div className="w-[60px]">操作</div>
          </div>

          {/* Rows */}
          {people.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-5 border-b border-border-light px-7 py-5 transition-fast last:border-b-0 hover:bg-hover-bg"
            >
              <div className="flex w-[120px] items-center gap-4">
                <Avatar name={p.name} className="h-7 w-7" />
                <span className="text-base font-medium text-text-primary">{p.name}</span>
              </div>
              <div className="flex-1 text-base text-text-secondary">{p.dept}</div>
              <div className="flex-1 text-base text-text-secondary">{p.role}</div>
              <div className="flex-1 text-base text-text-secondary">{p.level}</div>
              <div className="flex w-[140px] flex-wrap items-center gap-2">
                {p.skills.map((s) => (
                  <SkillBadge key={s}>{s}</SkillBadge>
                ))}
              </div>
              <div className="flex-1 text-base text-text-secondary">{p.tasks} 个</div>
              <div className="flex w-[110px] flex-col gap-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
                  <div
                    className={`h-full rounded-full ${loadColorClass(p.load)}`}
                    style={{ width: `${Math.min(p.load, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted">{p.load}%</span>
              </div>
              <div className="w-[80px]">
                <WorkStatusTag status={p.workStatus} />
              </div>
              <div className="w-[80px]">
                <AccountStatusTag status={p.accountStatus} />
              </div>
              <div className="w-[60px]">
                <button className="rounded-md bg-bg-secondary px-7 py-5 text-base font-medium text-text-muted transition-fast hover:bg-hover-bg">
                  查看
                </button>
              </div>
            </div>
          ))}

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-5">
            <span className="text-sm text-text-muted">共 {people.length} 人</span>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center rounded-md border border-border-subtle bg-bg-secondary px-7 py-5 text-base font-medium text-text-muted transition-fast hover:bg-hover-bg">
                ←
              </button>
              <button className="inline-flex items-center rounded-sm bg-primary-fill px-5 py-3 text-sm font-semibold text-primary-text">
                1
              </button>
              <button className="inline-flex items-center rounded-sm bg-bg-secondary px-5 py-3 text-sm text-text-muted transition-fast hover:bg-hover-bg">
                2
              </button>
              <button className="inline-flex items-center rounded-md border border-border-subtle bg-bg-secondary px-7 py-5 text-base font-medium text-text-muted transition-fast hover:bg-hover-bg">
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
