import { MainLayout } from '@/components/layout'
import {
  StatCard,
  Badge,
  Avatar,
  ProgressBar,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/ui'
import { projectList, projectStats, projectFilters } from '@/mocks/projectList'
import { ChevronDown } from 'lucide-react'

const colWidths = {
  name: 280,
  code: 100,
  status: 80,
  type: 80,
  owner: 100,
  date: 200,
  progress: 160,
  action: 60,
}

export function ProjectListPage() {
  return (
    <MainLayout title="项目" subtitle="全部项目与进度概览">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-5">
          {projectStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
          <div className="flex items-center gap-6">
            {projectFilters.map((f) => (
              <button
                key={f}
                className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
              >
                <span>{f}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            ))}
          </div>

          <Table>
            <Thead>
              <Tr>
                <Th style={{ width: colWidths.name }}>项目名称</Th>
                <Th style={{ width: colWidths.code }}>编号</Th>
                <Th style={{ width: colWidths.status }}>状态</Th>
                <Th style={{ width: colWidths.type }}>类型</Th>
                <Th style={{ width: colWidths.owner }}>负责人</Th>
                <Th style={{ width: colWidths.date }}>起止时间</Th>
                <Th style={{ width: colWidths.progress }}>进度</Th>
                <Th style={{ width: colWidths.action }}>操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {projectList.map((p) => (
                <Tr key={p.id}>
                  <Td style={{ width: colWidths.name }}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-medium text-text-primary">
                        {p.name}
                      </span>
                      <span className="text-xs text-text-muted">{p.code}</span>
                    </div>
                  </Td>
                  <Td style={{ width: colWidths.code }}>{p.code}</Td>
                  <Td style={{ width: colWidths.status }}>
                    <Badge>{p.status}</Badge>
                  </Td>
                  <Td style={{ width: colWidths.type }}>{p.type}</Td>
                  <Td style={{ width: colWidths.owner }}>
                    <div className="flex items-center gap-2">
                      <Avatar name={p.owner} className="h-6 w-6 text-xs" />
                      <span>{p.owner}</span>
                    </div>
                  </Td>
                  <Td style={{ width: colWidths.date }}>
                    {p.start} - {p.end.slice(5)}
                  </Td>
                  <Td style={{ width: colWidths.progress }}>
                    <ProgressBar value={p.progress} className="h-1.5" />
                  </Td>
                  <Td style={{ width: colWidths.action }}>
                    <button className="text-text-muted hover:text-text-primary">
                      <span className="text-lg leading-none">⋯</span>
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </div>
    </MainLayout>
  )
}

export default ProjectListPage
