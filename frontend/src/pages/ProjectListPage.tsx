import { MainLayout } from '@/components/layout'
import { Avatar, Badge, Button, EmptyState, Input, ProgressBar, SearchInput, Select } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { cn } from '@/lib/utils'
import { type ApiList, type ApiOrg, type ApiPerson, type ApiProject, formatDate, numberValue, projectStatusLabel, projectTypeLabel, textFromPayload, visibilityLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Check, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { ProjectDetailContent } from '@/pages/ProjectDetailPage'

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

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'preparing', label: '筹备' },
  { value: 'active', label: '进行中' },
  { value: 'paused', label: '暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

const projectTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'research', label: '科研' },
  { value: 'delivery', label: '交付' },
  { value: 'operation', label: '运营' },
  { value: 'other', label: '其他' },
]

const visibilityOptions = [
  { value: '', label: '全部可见性' },
  { value: 'normal', label: '普通' },
  { value: 'public', label: '公开' },
  { value: 'hidden', label: '隐藏' },
  { value: 'restricted', label: '指定范围' },
]

async function loadOptions() {
  const [people, orgs] = await Promise.all([
    apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }),
    apiGet<ApiList<ApiOrg>>('/orgs/tree'),
  ])
  return { people: people.items, orgs: orgs.items }
}

function valueFromParams(params: URLSearchParams, key: string) {
  const value = params.get(key)
  return value && value.trim() ? value : null
}

function loadProjects(params: URLSearchParams) {
  return apiGet<ApiList<ApiProject>>('/projects', {
    q: valueFromParams(params, 'q'),
    status: valueFromParams(params, 'status'),
    project_type: valueFromParams(params, 'project_type'),
    owner_id: valueFromParams(params, 'owner_id'),
    org_id: valueFromParams(params, 'org_id'),
    visibility: valueFromParams(params, 'visibility'),
    page_size: 100,
  })
}

function projectOwner(project: ApiProject) {
  return textFromPayload(project.payload, 'leader_name', project.payload?.owner_name as string | undefined)
}

function projectOrg(project: ApiProject) {
  return textFromPayload(project.payload, 'owner_org_name', textFromPayload(project.payload, 'org_name', '未设置'))
}

function projectPeriod(project: ApiProject) {
  const start = formatDate(project.start_date)
  const end = formatDate(project.end_date)
  if (start === '未设置' && end === '未设置') return '未设置'
  return `${start} - ${end}`
}

function statusClass(status?: string) {
  if (status === 'active') return 'bg-color-info-bg text-color-info'
  if (status === 'completed') return 'bg-color-success-bg text-color-success'
  if (status === 'paused') return 'bg-color-warning-bg text-color-warning'
  if (status === 'archived') return 'bg-hover-bg text-text-muted'
  return 'bg-hover-bg text-text-muted'
}

export function ProjectListPage() {
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState(initialForm)
  const [searchValue, setSearchValue] = useState(params.get('q') ?? '')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const showCreate = params.get('create') === '1'
  const selectedProjectId = params.get('project')
  const filterKey = params.toString()
  const { data, loading, error, reload } = useApiData(() => loadProjects(params), [filterKey])
  const optionsState = useApiData(loadOptions, [])
  const projects = data?.items ?? []
  const people = optionsState.data?.people ?? []
  const orgs = optionsState.data?.orgs ?? []
  const createParams = new URLSearchParams(params)
  createParams.set('create', '1')
  const createHref = `/projects?${createParams.toString()}`

  function closeCreate() {
    const next = new URLSearchParams(params)
    next.delete('create')
    setParams(next)
    setMessage(null)
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  function openProject(projectId: string) {
    const next = new URLSearchParams(params)
    next.set('project', projectId)
    setParams(next)
  }

  function closeProject() {
    const next = new URLSearchParams(params)
    next.delete('project')
    setParams(next)
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilter('q', searchValue.trim())
  }

  function clearFilters() {
    setSearchValue('')
    const next = new URLSearchParams(params)
    ;['q', 'status', 'project_type', 'owner_id', 'org_id', 'visibility'].forEach((key) => next.delete(key))
    setParams(next)
  }

  const hasFilters = ['q', 'status', 'project_type', 'owner_id', 'org_id', 'visibility'].some((key) => params.has(key))

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
      <div className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <section className="flex flex-col gap-3 rounded-md border border-border-subtle bg-bg-secondary p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-md bg-bg-secondary p-1">
              {['列表', '表格', '看板', '画廊', '时间线'].map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  className={index === 0 ? 'rounded-md bg-bg-tertiary px-3 py-1.5 text-sm font-semibold text-text-primary' : 'rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-hover-bg'}
                >
                  {tab}
                </button>
              ))}
            </div>
            <form className="flex items-center gap-2" onSubmit={submitSearch}>
              <SearchInput
                className="w-full sm:w-[280px]"
                placeholder="搜索项目名称、编号、负责人..."
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
              <Button className="h-9 px-3">
                <Search className="h-4 w-4" />
                搜索
              </Button>
              <Link to={createHref}>
                <Button className="h-9 px-3" type="button">
                  新建项目
                </Button>
              </Link>
            </form>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Select aria-label="项目状态筛选" className="w-[150px]" value={params.get('status') ?? ''} onChange={(event) => setFilter('status', event.target.value)} options={statusOptions} />
            <Select aria-label="项目类型筛选" className="w-[150px]" value={params.get('project_type') ?? ''} onChange={(event) => setFilter('project_type', event.target.value)} options={projectTypeOptions} />
            <Select
              aria-label="项目负责人筛选"
              className="w-[170px]"
              value={params.get('owner_id') ?? ''}
              onChange={(event) => setFilter('owner_id', event.target.value)}
              options={[{ value: '', label: '全部负责人' }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
            />
            <Select
              aria-label="项目组织筛选"
              className="w-[180px]"
              value={params.get('org_id') ?? ''}
              onChange={(event) => setFilter('org_id', event.target.value)}
              options={[{ value: '', label: '全部组织' }, ...orgs.map((org) => ({ value: org.id, label: org.name }))]}
            />
            <Select aria-label="项目可见性筛选" className="w-[150px]" value={params.get('visibility') ?? ''} onChange={(event) => setFilter('visibility', event.target.value)} options={visibilityOptions} />
            {hasFilters && (
              <button type="button" className="h-10 rounded-md px-3 text-sm text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary" onClick={clearFilters}>
                清空筛选
              </button>
            )}
          </div>
        </section>

        <div className="min-h-[calc(100vh-260px)] overflow-hidden rounded-md border border-border-subtle bg-bg-secondary">
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid h-11 grid-cols-[minmax(260px,2fr)_96px_96px_150px_minmax(180px,1.2fr)_170px_120px] items-center border-b border-border-subtle bg-bg-tertiary text-xs font-semibold text-text-muted">
                <div className="px-4">项目</div>
                <div className="px-4">状态</div>
                <div className="px-4">类型</div>
                <div className="px-4">负责人</div>
                <div className="px-4">组织 / 可见性</div>
                <div className="px-4">周期</div>
                <div className="px-4">进度</div>
              </div>
              {projects.map((project) => {
                const progress = numberValue(project.payload?.progress, project.status === 'completed' ? 100 : 0)
                const owner = projectOwner(project)
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={cn(
                      'grid min-h-[72px] grid-cols-[minmax(260px,2fr)_96px_96px_150px_minmax(180px,1.2fr)_170px_120px] items-center border-b border-border-subtle text-left text-sm transition-fast last:border-b-0 hover:bg-bg-tertiary',
                      selectedProjectId === project.id && 'bg-hover-bg'
                    )}
                    onClick={() => openProject(project.id)}
                  >
                    <div className="min-w-0 px-4">
                      <div className="truncate font-semibold text-text-primary">{project.name}</div>
                      <div className="mt-1 truncate text-sm text-text-muted">{project.summary || project.project_no || '暂无项目摘要'}</div>
                    </div>
                    <div className="px-4">
                      <Badge className={cn('whitespace-nowrap', statusClass(project.status))}>{projectStatusLabel(project.status)}</Badge>
                    </div>
                    <div className="truncate px-4 text-text-secondary">{projectTypeLabel(project.project_type)}</div>
                    <div className="flex min-w-0 items-center gap-2 px-4 text-text-secondary">
                      <Avatar name={owner} className="h-6 w-6 shrink-0 text-xs" />
                      <span className="truncate">{owner}</span>
                    </div>
                    <div className="min-w-0 px-4">
                      <div className="truncate text-text-secondary">{projectOrg(project)}</div>
                      <div className="mt-1 truncate text-xs text-text-muted">{visibilityLabel(project.visibility)}</div>
                    </div>
                    <div className="truncate px-4 text-text-muted">{projectPeriod(project)}</div>
                    <div className="px-4">
                      <ProgressBar value={progress} className="h-1.5" />
                      <div className="mt-1 text-xs text-text-muted">{progress}%</div>
                    </div>
                  </button>
                )
              })}
              {loading && <div className="px-4 py-10 text-center text-sm text-text-muted">正在加载项目...</div>}
            </div>
          </div>
          {!loading && projects.length === 0 && <EmptyState title="暂无项目" desc="当前可见范围内没有项目。" />}
        </div>

        {selectedProjectId && (
          <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full justify-end">
            <aside className="pointer-events-auto h-full w-full max-w-full border-l border-border-subtle bg-bg-primary shadow-2xl md:w-[64vw] md:max-w-[1080px]">
              <div className="h-full overflow-auto px-5 py-4">
                <ProjectDetailContent
                  id={selectedProjectId}
                  compact
                  onClose={closeProject}
                  projectSwitcher={
                    <Select
                      aria-label="切换项目"
                      className="w-full"
                      value={selectedProjectId}
                      onChange={(event) => openProject(event.target.value)}
                      options={projects.map((project) => ({ value: project.id, label: project.name }))}
                    />
                  }
                />
              </div>
            </aside>
          </div>
        )}

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
