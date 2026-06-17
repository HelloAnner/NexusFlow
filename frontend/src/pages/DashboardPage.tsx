import { MainLayout } from '@/components/layout'
import { Panel, StatCard, Tag, Badge } from '@/components/ui'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const stats = [
  { label: '进行中任务', value: '24', sub: '较上周 +3' },
  { label: '待处理审批', value: '7', sub: '2个即将超时' },
  { label: '部门负载', value: '87%', sub: '3人超载' },
  { label: '本周到期', value: '12', sub: '其中重点 4' },
]

const tasks = [
  { id: '1', name: 'Q2 科研项目里程碑评审', end: '6月20日', status: '进行中', tag: 'success' as const },
  { id: '2', name: '部门月度汇报PPT', end: '6月18日', status: '待确认', tag: 'warning' as const },
  { id: '3', name: '跨部门人员协调：市场支持', end: '6月19日', status: '待审批', tag: 'error' as const },
  { id: '4', name: '新员工培训资料准备', end: '6月25日', status: '进行中', tag: 'success' as const },
  { id: '5', name: '出差：北京技术交流', end: '6月22日', status: '进行中', tag: 'success' as const },
]

const todos = [
  { id: '1', title: '确认市场支持任务人员安排', type: '审批' },
  { id: '2', title: '审核李明的阶段成果', type: '验收' },
  { id: '3', title: '处理王芳的负载冲突', type: '冲突' },
  { id: '4', title: '补充科研项目资料', type: '资料' },
]

const risks = [
  { id: '1', title: 'Q2 科研项目', desc: '延期风险', tag: '2天' },
  { id: '2', title: '王芳', desc: '负载超载', tag: '6月18-19日' },
  { id: '3', title: '市场支持任务', desc: '跨部门未审批', tag: '待处理' },
]

export function DashboardPage() {
  const dateStr = format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhCN })
  return (
    <MainLayout title="早上好，张主任" subtitle={dateStr}>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-5">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
          ))}
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-6">
          <Panel title="我的任务" right={<Link to="/tasks" className="flex items-center text-sm text-text-muted hover:text-text-primary">查看全部 <ChevronRight className="h-4 w-4" /></Link>}>
            <div className="mb-2 text-sm text-text-muted">6 个进行中任务</div>
            <div className="flex flex-col">
              {tasks.map((t) => (
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
