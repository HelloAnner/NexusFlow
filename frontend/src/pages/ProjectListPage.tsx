import { MainLayout } from '@/components/layout'
import { Avatar, Badge, EmptyState, ProgressBar, StatCard, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { type ApiList, type ApiProject, formatDate, numberValue, projectStatusLabel, textFromPayload } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { ChevronDown } from 'lucide-react'

const projectFilters = ['项目状态', '项目类型', '负责人', '所属组织', '时间范围']

export function ProjectListPage() {
  const { data, loading, error } = useApiData(() => apiGet<ApiList<ApiProject>>('/projects', { page_size: 100 }))
  const projects = data?.items ?? []
  const active = projects.filter((project) => project.status === 'active').length
  const hidden = projects.filter((project) => project.visibility === 'hidden').length
  const archived = projects.filter((project) => project.status === 'archived').length

  return (
    <MainLayout title="项目" subtitle="全部项目与进度概览">
      <div className="flex flex-col gap-6">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}
        <div className="grid grid-cols-4 gap-5">
          <StatCard label="全部项目" value={projects.length} sub={loading ? '加载中' : '真实项目数据'} />
          <StatCard label="进行中" value={active} />
          <StatCard label="隐藏项目" value={hidden} />
          <StatCard label="已归档" value={archived} />
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
          <div className="flex items-center gap-6">
            {projectFilters.map((filter) => (
              <button key={filter} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
                <span>{filter}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            ))}
          </div>

          <Table>
            <Thead>
              <Tr><Th>项目名称</Th><Th>编号</Th><Th>状态</Th><Th>类型</Th><Th>负责人</Th><Th>起止时间</Th><Th>进度</Th><Th>可见性</Th></Tr>
            </Thead>
            <Tbody>
              {projects.map((project) => {
                const progress = numberValue(project.payload?.progress, project.status === 'completed' ? 100 : 0)
                const owner = textFromPayload(project.payload, 'leader_name', project.payload?.owner_name as string | undefined)
                return (
                  <Tr key={project.id}>
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base font-medium text-text-primary">{project.name}</span>
                        <span className="text-xs text-text-muted">{project.summary || project.project_no}</span>
                      </div>
                    </Td>
                    <Td>{project.project_no}</Td>
                    <Td><Badge>{projectStatusLabel(project.status)}</Badge></Td>
                    <Td>{project.project_type || 'other'}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={owner} className="h-6 w-6 text-xs" />
                        <span>{owner}</span>
                      </div>
                    </Td>
                    <Td>{formatDate(project.start_date)} - {formatDate(project.end_date)}</Td>
                    <Td><ProgressBar value={progress} className="h-1.5" /></Td>
                    <Td>{project.visibility === 'hidden' ? '隐藏' : '普通'}</Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
          {!loading && projects.length === 0 && <EmptyState title="暂无项目" desc="当前可见范围内没有项目。" />}
        </div>
      </div>
    </MainLayout>
  )
}

export default ProjectListPage
