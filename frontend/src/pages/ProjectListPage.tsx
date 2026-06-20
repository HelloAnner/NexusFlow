import { MainLayout } from '@/components/layout'
import { Avatar, Badge, Button, EmptyState, Input, ProgressBar, SearchInput, Select } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiOrg, type ApiPerson, type ApiProject, formatDate, numberValue, projectStatusLabel, projectTypeLabel, textFromPayload, visibilityLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Check, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'

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

export function ProjectListPage() {
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState(initialForm)
  const [searchValue, setSearchValue] = useState(params.get('q') ?? '')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const showCreate = params.get('create') === '1'
  const filterKey = params.toString()
  const { data, loading, error, reload } = useApiData(() => loadProjects(params), [filterKey])
  const optionsState = useApiData(loadOptions, [])
  const projects = data?.items ?? []
  const people = optionsState.data?.people ?? []
  const orgs = optionsState.data?.orgs ?? []

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

        <div className="-mt-[58px] flex flex-wrap items-center justify-end gap-2">
          {['视图', '筛选', '排序'].map((label) => (
            <button key={label} type="button" className="h-9 rounded-md border border-border-subtle bg-bg-secondary px-3 text-sm text-text-secondary hover:bg-hover-bg">
              {label}
            </button>
          ))}
          <Link to="/projects?create=1">
            <Button className="h-9 px-3">新建项目</Button>
          </Link>
        </div>

        <div className="flex flex-col gap-4">
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

          <div className="grid min-h-[calc(100vh-232px)] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const progress = numberValue(project.payload?.progress, project.status === 'completed' ? 100 : 0)
              const owner = textFromPayload(project.payload, 'leader_name', project.payload?.owner_name as string | undefined)
              return (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="flex min-h-[320px] flex-col rounded-md border border-border-subtle bg-bg-secondary p-3 transition-fast hover:-translate-y-0.5 hover:shadow-dropdown"
                >
                  <div className="h-20 rounded-md bg-bg-tertiary" />
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-text-primary">{project.name}</h2>
                      <p className="mt-1 line-clamp-2 text-sm text-text-muted">{project.summary || project.project_no || '暂无项目摘要'}</p>
                    </div>
                    <Badge>{projectStatusLabel(project.status)}</Badge>
                  </div>
                  <ProgressBar value={progress} className="mt-4 h-1.5" />
                  <div className="mt-3 text-sm text-text-muted">{progress}%</div>
                  <div className="mt-auto grid grid-cols-2 gap-3 pt-6 text-sm text-text-secondary">
                    <span>{projectTypeLabel(project.project_type)}</span>
                    <span>{visibilityLabel(project.visibility)}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={owner} className="h-6 w-6 text-xs" />
                      <span className="truncate">{owner}</span>
                    </span>
                    <span>{formatDate(project.end_date)}</span>
                  </div>
                </Link>
              )
            })}
          </div>
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
