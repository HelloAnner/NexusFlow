import { MainLayout } from '@/components/layout'
import { Avatar, Badge, Button, EmptyState, Input, ProgressBar, Select, StatCard, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiProject, formatDate, numberValue, projectStatusLabel, textFromPayload } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Check, ChevronDown, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const projectFilters = ['项目状态', '项目类型', '负责人', '所属组织', '时间范围']

const initialForm = {
  project_no: '',
  name: '',
  project_type: 'other',
  level: 'custom',
  status: 'preparing',
  visibility: 'normal',
  start_date: '',
  end_date: '',
  summary: '',
}

export function ProjectListPage() {
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState(initialForm)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const showCreate = params.get('create') === '1'
  const { data, loading, error, reload } = useApiData(() => apiGet<ApiList<ApiProject>>('/projects', { page_size: 100 }))
  const projects = data?.items ?? []
  const active = projects.filter((project) => project.status === 'active').length
  const hidden = projects.filter((project) => project.visibility === 'hidden').length
  const archived = projects.filter((project) => project.status === 'archived').length

  function closeCreate() {
    const next = new URLSearchParams(params)
    next.delete('create')
    setParams(next)
    setMessage(null)
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim()) {
      setMessage('请填写项目名称')
      return
    }
    setCreating(true)
    setMessage(null)
    try {
      await apiPost('/projects', {
        ...form,
        project_no: form.project_no.trim() || undefined,
        name: form.name.trim(),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      })
      setForm(initialForm)
      closeCreate()
      await reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建项目失败')
    } finally {
      setCreating(false)
    }
  }

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

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20 px-6 py-5">
            <form className="w-[520px] rounded-lg border border-border-subtle bg-bg-primary p-5 shadow-2xl" onSubmit={createProject}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">新建项目</h2>
                  <p className="mt-1 text-sm text-text-muted">创建后会自动把当前用户加入项目成员。</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary"
                  aria-label="关闭新建项目"
                  onClick={closeCreate}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="项目名称" value={form.name} onChange={(event) => updateField('name', event.target.value)} required />
                <Input label="项目编号" value={form.project_no} placeholder="留空自动生成" onChange={(event) => updateField('project_no', event.target.value)} />
                <Select
                  label="项目类型"
                  value={form.project_type}
                  onChange={(event) => updateField('project_type', event.target.value)}
                  options={[
                    { value: 'research', label: '科研' },
                    { value: 'delivery', label: '交付' },
                    { value: 'operation', label: '运营' },
                    { value: 'other', label: '其他' },
                  ]}
                />
                <Select
                  label="状态"
                  value={form.status}
                  onChange={(event) => updateField('status', event.target.value)}
                  options={[
                    { value: 'preparing', label: '筹备' },
                    { value: 'active', label: '进行中' },
                    { value: 'paused', label: '暂停' },
                  ]}
                />
                <Input label="开始日期" type="date" value={form.start_date} onChange={(event) => updateField('start_date', event.target.value)} />
                <Input label="结束日期" type="date" value={form.end_date} onChange={(event) => updateField('end_date', event.target.value)} />
              </div>

              <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-text-muted">
                项目说明
                <textarea
                  className="min-h-28 w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary placeholder:text-text-placeholder focus:border-text-muted focus:outline-none"
                  value={form.summary}
                  onChange={(event) => updateField('summary', event.target.value)}
                  placeholder="填写项目目标、边界或备注"
                />
              </label>

              {message && <div className="mt-4 rounded-md bg-color-error-bg px-3 py-2 text-sm text-color-error">{message}</div>}

              <div className="mt-5 flex items-center justify-end gap-3 border-t border-border-subtle pt-4">
                <Button type="button" variant="secondary" className="h-10 px-4" onClick={closeCreate}>
                  取消
                </Button>
                <Button type="submit" className="h-10 px-4" disabled={creating}>
                  <Check className="h-4 w-4" />
                  {creating ? '创建中...' : '创建项目'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

export default ProjectListPage
