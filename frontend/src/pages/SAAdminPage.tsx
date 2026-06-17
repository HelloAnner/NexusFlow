import { MainLayout } from '@/components/layout'
import { Avatar, Badge, Button, EmptyState, Input, NavItem, Panel, Select, StatCard, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import type { TagProps } from '@/components/ui'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { type ApiList, type ApiPerson, accountStatusLabel, formatDateTime, workStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Activity, Building2, FileText, LayoutDashboard, Link as LinkIcon, Mail, Save, ShieldCheck, UserCheck, UserCog, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'

interface AdminDashboard {
  pending_registrations?: number
  enabled_accounts?: number
  open_conflicts?: number
}

interface Account {
  id: string
  login_name: string
  person_id?: string | null
  status?: string
  last_login_at?: string | null
  failed_login_count?: number
  created_at?: string
}

interface Registration {
  id: string
  status?: string
  person_id?: string | null
  account_id?: string | null
  created_at?: string
  reviewed_at?: string | null
  review_comment?: string
  payload?: Record<string, unknown>
}

interface RuntimeStatus {
  status?: string
  database?: boolean
  redis?: boolean
  s3_configured?: boolean
  search_backend?: string
  uptime_seconds?: number
}

interface AuditLog {
  id: string
  object_type?: string
  object_id?: string
  action?: string
  created_at?: string
  reason?: string
  actor_id?: string | null
}

interface Role {
  id: string
  code: string
  name: string
  role_type?: string
  enabled?: boolean
}

interface Org {
  id: string
  name: string
  code?: string
  org_type?: string
  parent_id?: string | null
  enabled?: boolean
}

interface InvitationTemplate {
  id: string
  name?: string
  invite_type?: string
  default_org_id?: string | null
  default_role_ids?: string[]
  default_project_id?: string | null
  need_approval?: boolean
  expires_in_days?: number
  max_uses?: number
  status?: string
  created_at?: string
  updated_at?: string
  payload?: Record<string, unknown>
}

interface InvitationLink {
  id: string
  template_id?: string
  status?: string
  expires_at?: string | null
  max_uses?: number
  used_count?: number
  created_by?: string
  created_at?: string
}

interface AdminData {
  dashboard: AdminDashboard
  registrations: ApiList<Registration>
  people: ApiList<ApiPerson>
  accounts: ApiList<Account>
  templates: ApiList<InvitationTemplate>
  links: ApiList<InvitationLink>
  runtime: RuntimeStatus
  audits: ApiList<AuditLog>
  roles: ApiList<Role>
  orgs: ApiList<Org>
}

const secondaryNav = [
  { id: 'overview', label: '总览' },
  { id: 'pending', label: '待审核注册' },
  { id: 'personnel', label: '人员管理' },
  { id: 'templates', label: '邀请模板' },
  { id: 'links', label: '邀请链接' },
  { id: 'role-entry', label: '角色入口' },
  { id: 'security', label: '账号安全' },
  { id: 'audit', label: '审计日志' },
  { id: 'status', label: '运行状态' },
]

const navIcons: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  pending: UserCheck,
  personnel: Users,
  templates: Mail,
  links: LinkIcon,
  'role-entry': UserCog,
  security: ShieldCheck,
  audit: FileText,
  status: Activity,
}

type TagVariant = NonNullable<TagProps['variant']>

const accountVariant = (status?: string): TagVariant => status === 'enabled' ? 'success' : status === 'locked' || status === 'disabled' ? 'error' : 'warning'
const enabledVariant = (enabled?: boolean): TagVariant => enabled === false ? 'warning' : 'success'

async function loadAdminData() {
  const [dashboard, registrations, people, accounts, templates, links, runtime, audits, roles, orgs] = await Promise.all([
    apiGet<AdminDashboard>('/admin/dashboard'),
    apiGet<ApiList<Registration>>('/admin/registrations'),
    apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }),
    apiGet<ApiList<Account>>('/admin/accounts'),
    apiGet<ApiList<InvitationTemplate>>('/invitations/templates'),
    apiGet<ApiList<InvitationLink>>('/invitations/links'),
    apiGet<RuntimeStatus>('/config/runtime-status'),
    apiGet<ApiList<AuditLog>>('/audit/permission', { page_size: 100 }),
    apiGet<ApiList<Role>>('/roles', { page_size: 200 }),
    apiGet<ApiList<Org>>('/orgs', { page_size: 200 }),
  ])
  return { dashboard, registrations, people, accounts, templates, links, runtime, audits, roles, orgs }
}

export default function SAAdminPage() {
  const [activeNav, setActiveNav] = useState('overview')
  const [acting, setActing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(loadAdminData)

  const registrations = data?.registrations.items ?? []
  const people = data?.people.items ?? []
  const accounts = data?.accounts.items ?? []
  const templates = data?.templates.items ?? []
  const links = data?.links.items ?? []
  const audits = data?.audits.items ?? []
  const roles = data?.roles.items ?? []
  const orgs = data?.orgs.items ?? []

  async function perform(label: string, action: () => Promise<unknown>) {
    setActing(label)
    setMessage(null)
    setErrorMessage(null)
    try {
      const res = await action()
      setMessage(typeof res === 'string' ? res : `${label}完成`)
      await reload()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : `${label}失败`)
    } finally {
      setActing(null)
    }
  }

  async function reviewRegistration(id: string, action: 'approve' | 'reject') {
    await perform(action === 'approve' ? '审核通过' : '审核拒绝', () =>
      apiPost(`/admin/registrations/${id}/${action}`, { comment: action === 'approve' ? '审核通过' : '审核拒绝' })
    )
  }

  const context = { data: data ?? undefined, registrations, people, accounts, templates, links, audits, roles, orgs, loading, acting, perform, reviewRegistration, setActiveNav }

  return (
    <MainLayout title="系统管理" subtitle="SA 后台、账号与邀请注册">
      <div className="flex h-full gap-6">
        <aside className="flex w-[220px] shrink-0 flex-col rounded-lg border border-border-subtle bg-bg-secondary p-4">
          <div className="mb-1 px-3">
            <h2 className="text-lg font-semibold text-text-primary">系统管理</h2>
            <p className="text-sm text-text-muted">逐项管理后台功能</p>
          </div>
          <div className="my-2 h-2" />
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {secondaryNav.map((item) => (
              <NavItem key={item.id} icon={navIcons[item.id] ?? LayoutDashboard} label={item.label} active={activeNav === item.id} onClick={() => setActiveNav(item.id)} />
            ))}
          </nav>
          <div className="mt-2 flex items-center gap-3 border-t border-border-subtle pt-4">
            <Avatar name="超级管理员" className="h-9 w-9" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">超级管理员</span>
              <span className="text-xs text-text-muted">SA</span>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {(error || errorMessage || message) && (
            <div className={`rounded-md px-4 py-3 text-sm ${error || errorMessage ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
              {error || errorMessage || message}
            </div>
          )}
          {activeNav === 'overview' && <OverviewView {...context} />}
          {activeNav === 'pending' && <PendingView {...context} />}
          {activeNav === 'personnel' && <PersonnelView {...context} />}
          {activeNav === 'templates' && <TemplateView {...context} />}
          {activeNav === 'links' && <LinkView {...context} />}
          {activeNav === 'role-entry' && <RoleEntryView {...context} />}
          {activeNav === 'security' && <SecurityView {...context} />}
          {activeNav === 'audit' && <AuditView {...context} />}
          {activeNav === 'status' && <StatusView {...context} />}
        </div>
      </div>
    </MainLayout>
  )
}

type AdminContext = {
  data: AdminData | undefined
  registrations: Registration[]
  people: ApiPerson[]
  accounts: Account[]
  templates: InvitationTemplate[]
  links: InvitationLink[]
  audits: AuditLog[]
  roles: Role[]
  orgs: Org[]
  loading: boolean
  acting: string | null
  perform: (label: string, action: () => Promise<unknown>) => Promise<void>
  reviewRegistration: (id: string, action: 'approve' | 'reject') => Promise<void>
  setActiveNav: (value: string) => void
}

function OverviewView({ data, registrations, people, accounts, templates, links, audits, roles, setActiveNav }: AdminContext) {
  const pending = registrations.filter((item) => item.status === 'pending')
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-6 gap-4">
        <StatCard label="组织" value={data?.orgs.items.length ?? 0} />
        <StatCard label="人员" value={people.length} />
        <StatCard label="账号启用" value={data?.dashboard.enabled_accounts ?? accounts.filter((item) => item.status === 'enabled').length} />
        <StatCard label="运行状态" value={data?.runtime.status ?? '未知'} />
        <StatCard label="待审核注册" value={data?.dashboard.pending_registrations ?? pending.length} />
        <StatCard label="有效邀请" value={links.filter((item) => item.status === 'enabled').length} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" className="h-10 px-4" onClick={() => setActiveNav('personnel')}><Building2 className="h-4 w-4" />新建组织</Button>
        <Button variant="secondary" className="h-10 px-4" onClick={() => setActiveNav('personnel')}><UserPlus className="h-4 w-4" />新建人员</Button>
        <Button className="h-10 px-4" onClick={() => setActiveNav('links')}><LinkIcon className="h-4 w-4" />生成邀请链接</Button>
        <Button variant="secondary" className="h-10 px-4" onClick={() => setActiveNav('audit')}><FileText className="h-4 w-4" />查看审计日志</Button>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        <div className="flex flex-col gap-6">
          <Panel title="待审核注册" right={<button className="text-sm text-text-muted hover:text-text-primary" onClick={() => setActiveNav('pending')}>查看全部</button>}>
            <RegistrationRows registrations={pending.slice(0, 6)} compact />
          </Panel>
          <Panel title="邀请模板">
            <div className="flex flex-col divide-y divide-border-subtle">
              {templates.slice(0, 5).map((template) => (
                <div key={template.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-medium text-text-primary">{template.name ?? '邀请模板'}</span>
                    <span className="text-sm text-text-muted">{template.invite_type ?? 'user'} · {template.expires_in_days ?? 7} 天 · {template.max_uses ?? 1} 次</span>
                  </div>
                  <Tag variant={template.status === 'enabled' ? 'success' : 'warning'}>{template.status ?? 'enabled'}</Tag>
                </div>
              ))}
            </div>
            {templates.length === 0 && <EmptyState title="暂无模板" desc="进入邀请模板页创建第一条模板。" />}
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <RuntimePanel runtime={data?.runtime} />
          <Panel title="账号异常">
            <div className="flex flex-col divide-y divide-border-subtle">
              {accounts.filter((item) => item.status !== 'enabled' || (item.failed_login_count ?? 0) > 0).slice(0, 6).map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-text-primary">{account.login_name}</span>
                    <span className="text-sm text-text-muted">失败 {account.failed_login_count ?? 0} 次</span>
                  </div>
                  <Tag variant={accountVariant(account.status)}>{accountStatusLabel(account.status)}</Tag>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="最近权限/配置审计">
            <AuditRows audits={audits.slice(0, 5)} />
          </Panel>
          <Panel title="角色入口概览">
            <div className="flex flex-col divide-y divide-border-subtle">
              {roles.slice(0, 5).map((role) => (
                <div key={role.id} className="flex items-center justify-between py-3">
                  <span className="text-base font-medium text-text-primary">{role.name}</span>
                  <Badge>{role.code}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function PendingView({ registrations, acting, reviewRegistration, loading }: AdminContext) {
  const [status, setStatus] = useState('pending')
  const filtered = registrations.filter((item) => status === 'all' || (item.status ?? 'pending') === status)
  return (
    <Panel title="待审核注册">
      <div className="flex items-center gap-3">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} options={[
          { value: 'pending', label: '待审核' },
          { value: 'approved', label: '已通过' },
          { value: 'rejected', label: '已拒绝' },
          { value: 'all', label: '全部' },
        ]} />
      </div>
      <Table>
        <Thead><Tr><Th>姓名</Th><Th>账号</Th><Th>联系</Th><Th>状态</Th><Th>注册时间</Th><Th>审核意见</Th><Th>操作</Th></Tr></Thead>
        <Tbody>
          {filtered.map((item) => (
            <Tr key={item.id}>
              <Td>{String(item.payload?.name ?? item.person_id ?? '注册申请')}</Td>
              <Td>{String(item.payload?.login_name ?? item.account_id ?? '-')}</Td>
              <Td>{String(item.payload?.contact ?? item.payload?.employee_no ?? '-')}</Td>
              <Td><RegistrationTag status={item.status} /></Td>
              <Td>{formatDateTime(item.created_at)}</Td>
              <Td>{item.review_comment || '-'}</Td>
              <Td>
                {item.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button className="h-8 px-3 text-sm" disabled={acting === '审核通过'} onClick={() => void reviewRegistration(item.id, 'approve')}>通过</Button>
                    <Button variant="danger" className="h-8 px-3 text-sm" disabled={acting === '审核拒绝'} onClick={() => void reviewRegistration(item.id, 'reject')}>拒绝</Button>
                  </div>
                ) : '-'}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {!loading && filtered.length === 0 && <EmptyState title="暂无注册申请" desc="当前筛选下没有注册申请。" />}
    </Panel>
  )
}

function PersonnelView({ people, roles, orgs, perform, acting, loading }: AdminContext) {
  const [selected, setSelected] = useState<ApiPerson | null>(null)
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <Panel title="SA 人员管理">
        <Table>
          <Thead><Tr><Th>姓名</Th><Th>登录账号</Th><Th>主组织</Th><Th>角色</Th><Th>工作状态</Th><Th>账号状态</Th><Th>操作</Th></Tr></Thead>
          <Tbody>
            {people.map((person) => (
              <Tr key={person.id}>
                <Td>{person.name}</Td>
                <Td>{person.account_id ?? '-'}</Td>
                <Td>{orgName(orgs, person.primary_org_id)}</Td>
                <Td>{roleNames(roles, person.system_role_ids ?? person.payload?.role_ids)}</Td>
                <Td>{workStatusLabel(person.work_status)}</Td>
                <Td><Tag variant={accountVariant(person.account_status)}>{accountStatusLabel(person.account_status)}</Tag></Td>
                <Td><button className="text-sm text-text-muted hover:text-text-primary" onClick={() => setSelected(person)}>编辑全量信息</button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!loading && people.length === 0 && <EmptyState title="暂无人员" desc="当前没有可管理人员。" />}
      </Panel>
      <div className="flex flex-col gap-6">
        <CreateOrgPanel orgs={orgs} perform={perform} acting={acting} />
        <CreatePersonPanel orgs={orgs} roles={roles} perform={perform} acting={acting} />
        {selected && <EditPersonPanel person={selected} orgs={orgs} roles={roles} perform={perform} acting={acting} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}

function TemplateView({ templates, orgs, roles, perform, acting, loading }: AdminContext) {
  const [editing, setEditing] = useState<InvitationTemplate | null>(null)
  return (
    <div className="grid grid-cols-[1fr_380px] gap-6">
      <Panel title="邀请模板管理">
        <Table>
          <Thead><Tr><Th>邀请名称</Th><Th>类型</Th><Th>默认组织</Th><Th>默认角色</Th><Th>审核</Th><Th>有效期/次数</Th><Th>状态</Th><Th>操作</Th></Tr></Thead>
          <Tbody>
            {templates.map((template) => (
              <Tr key={template.id}>
                <Td>{template.name ?? '未命名模板'}</Td>
                <Td>{template.invite_type ?? 'user'}</Td>
                <Td>{orgName(orgs, template.default_org_id)}</Td>
                <Td>{roleNames(roles, template.default_role_ids)}</Td>
                <Td>{template.need_approval ? '需要' : '免审'}</Td>
                <Td>{template.expires_in_days ?? 7} 天 / {template.max_uses ?? 1} 次</Td>
                <Td><Tag variant={template.status === 'enabled' ? 'success' : 'warning'}>{template.status ?? 'enabled'}</Tag></Td>
                <Td>
                  <div className="flex gap-2">
                    <button className="text-sm text-text-muted hover:text-text-primary" onClick={() => setEditing(template)}>编辑</button>
                    <button className="text-sm text-text-muted hover:text-text-primary" onClick={() => void perform('生成邀请链接', async () => {
                      const res = await apiPost<{ url: string }>(`/invitations/templates/${template.id}/links`)
                      return `完整邀请链接只展示一次：${res.url}`
                    })}>生成链接</button>
                    <button className="text-sm text-color-error hover:underline" onClick={() => void perform('停用模板', () => apiPatch(`/invitations/templates/${template.id}`, { status: 'disabled' }))}>停用</button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!loading && templates.length === 0 && <EmptyState title="暂无邀请模板" desc="创建模板后才能生成邀请链接。" />}
      </Panel>
      <TemplateForm
        key={`${editing?.id ?? 'new'}-${orgs[0]?.id ?? ''}-${roles[0]?.id ?? ''}`}
        template={editing}
        orgs={orgs}
        roles={roles}
        perform={perform}
        acting={acting}
        onClear={() => setEditing(null)}
      />
    </div>
  )
}

function LinkView({ templates, links, perform, acting, loading }: AdminContext) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <Panel title="邀请链接管理">
        <Table>
          <Thead><Tr><Th>链接</Th><Th>所属模板</Th><Th>状态</Th><Th>有效期</Th><Th>使用次数</Th><Th>生成人</Th><Th>操作</Th></Tr></Thead>
          <Tbody>
            {links.map((link) => (
              <Tr key={link.id}>
                <Td className="font-mono text-xs">{link.id}</Td>
                <Td>{templateName(templates, link.template_id)}</Td>
                <Td><Tag variant={link.status === 'enabled' ? 'success' : 'warning'}>{link.status ?? 'enabled'}</Tag></Td>
                <Td>{formatDateTime(link.expires_at)}</Td>
                <Td>{link.used_count ?? 0} / {link.max_uses ?? 1}</Td>
                <Td>{link.created_by ?? '-'}</Td>
                <Td><button className="text-sm text-color-error hover:underline" onClick={() => void perform('停用邀请链接', () => apiPost(`/invitations/links/${link.id}/disable`))}>停用</button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!loading && links.length === 0 && <EmptyState title="暂无邀请链接" desc="从右侧选择模板生成邀请链接。" />}
      </Panel>
      <Panel title="生成邀请链接">
        <Select label="邀请模板" value={templateId} onChange={(event) => setTemplateId(event.target.value)} options={templates.map((template) => ({ value: template.id, label: template.name ?? template.id }))} />
        <Button disabled={!templateId || acting === '生成邀请链接'} onClick={() => void perform('生成邀请链接', async () => {
          const res = await apiPost<{ url: string }>(`/invitations/templates/${templateId}/links`)
          return `完整邀请链接只展示一次：${res.url}`
        })}>
          <LinkIcon className="h-4 w-4" />生成链接
        </Button>
        <p className="text-sm text-text-muted">后续列表只展示脱敏记录，完整链接请在生成后立即复制。</p>
      </Panel>
    </div>
  )
}

function RoleEntryView({ roles, perform, acting }: AdminContext) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  const [defaultHome, setDefaultHome] = useState('/admin')
  const [menus, setMenus] = useState('首页,任务,甘特图,项目,人员,系统管理')
  return (
    <div className="grid grid-cols-[420px_1fr] gap-6">
      <Panel title="角色入口配置">
        <form className="flex flex-col gap-5" onSubmit={(event) => {
          event.preventDefault()
          void perform('发布角色入口配置', async () => {
            const payload = {
              role_id: roleId,
              default_home: defaultHome,
              navigation: menus.split(',').map((item) => item.trim()).filter(Boolean),
              updated_from: 'sa-admin',
            }
            const draft = await apiPost<{ id: string }>('/config/role_entry/draft', payload)
            await apiPost('/config/role_entry/publish', { id: draft.id, reason: 'SA 发布角色入口配置' })
          })
        }}>
          <Select label="角色" value={roleId} onChange={(event) => setRoleId(event.target.value)} options={roles.map((role) => ({ value: role.id, label: `${role.name} (${role.code})` }))} />
          <Input label="默认首页" value={defaultHome} onChange={(event) => setDefaultHome(event.target.value)} />
          <Input label="导航菜单（逗号分隔）" value={menus} onChange={(event) => setMenus(event.target.value)} />
          <Button disabled={!roleId || acting === '发布角色入口配置'}><Save className="h-4 w-4" />保存并发布</Button>
        </form>
      </Panel>
      <Panel title="角色入口预览">
        <div className="grid grid-cols-2 gap-4">
          {roles.map((role) => (
            <div key={role.id} className="flex flex-col gap-2 rounded-md border border-border-subtle p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-primary">{role.name}</span>
                <Tag variant={enabledVariant(role.enabled)}>{role.enabled === false ? '停用' : '启用'}</Tag>
              </div>
              <span className="text-sm text-text-muted">{role.code} · {role.role_type ?? 'business'}</span>
              <span className="text-xs text-text-muted">默认首页和导航以最新发布的 role_entry 配置为准。</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function SecurityView({ accounts, perform, acting, loading }: AdminContext) {
  return (
    <Panel title="账号安全">
      <Table>
        <Thead><Tr><Th>账号</Th><Th>状态</Th><Th>失败次数</Th><Th>最近登录</Th><Th>创建时间</Th><Th>操作</Th></Tr></Thead>
        <Tbody>
          {accounts.map((account) => (
            <Tr key={account.id}>
              <Td>{account.login_name}</Td>
              <Td><Tag variant={accountVariant(account.status)}>{accountStatusLabel(account.status)}</Tag></Td>
              <Td>{account.failed_login_count ?? 0}</Td>
              <Td>{formatDateTime(account.last_login_at)}</Td>
              <Td>{formatDateTime(account.created_at)}</Td>
              <Td>
                <div className="flex gap-2">
                  <Button variant="danger" className="h-8 px-3 text-sm" disabled={acting === '禁用账号' || account.status === 'disabled'} onClick={() => void perform('禁用账号', () => apiPost(`/admin/accounts/${account.id}/disable`))}>禁用</Button>
                  <Button variant="secondary" className="h-8 px-3 text-sm" disabled={acting === '解锁账号'} onClick={() => void perform('解锁账号', () => apiPost(`/admin/accounts/${account.id}/unlock`))}>解锁</Button>
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {!loading && accounts.length === 0 && <EmptyState title="暂无账号" desc="当前没有账号记录。" />}
      <p className="text-sm text-text-muted">重置密码、强制下线、解绑登录方式尚无后端接口，本页不再放置无响应按钮。</p>
    </Panel>
  )
}

function AuditView({ audits, loading }: AdminContext) {
  const [q, setQ] = useState('')
  const filtered = audits.filter((audit) => !q || `${audit.action ?? ''} ${audit.object_type ?? ''} ${audit.reason ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Panel title="审计日志">
      <Input placeholder="按操作类型、对象类型或原因过滤" value={q} onChange={(event) => setQ(event.target.value)} />
      <Table>
        <Thead><Tr><Th>操作</Th><Th>对象</Th><Th>对象 ID</Th><Th>原因</Th><Th>时间</Th></Tr></Thead>
        <Tbody>
          {filtered.map((audit) => (
            <Tr key={audit.id}>
              <Td>{audit.action ?? '-'}</Td>
              <Td>{audit.object_type ?? '-'}</Td>
              <Td className="font-mono text-xs">{audit.object_id ?? '-'}</Td>
              <Td>{audit.reason || '-'}</Td>
              <Td>{formatDateTime(audit.created_at)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {!loading && filtered.length === 0 && <EmptyState title="暂无审计日志" desc="当前筛选下没有审计记录。" />}
    </Panel>
  )
}

function StatusView({ data }: AdminContext) {
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <RuntimePanel runtime={data?.runtime} />
      <Panel title="运行细节">
        <InfoRow label="状态" value={data?.runtime.status ?? '未知'} />
        <InfoRow label="数据库" value={data?.runtime.database ? '正常' : '未就绪'} />
        <InfoRow label="Redis" value={data?.runtime.redis ? '正常' : '未就绪'} />
        <InfoRow label="对象存储" value={data?.runtime.s3_configured ? '已配置' : '未配置'} />
        <InfoRow label="搜索后端" value={data?.runtime.search_backend ?? 'unknown'} />
        <InfoRow label="运行时长" value={`${data?.runtime.uptime_seconds ?? 0}s`} />
      </Panel>
    </div>
  )
}

function RuntimePanel({ runtime }: { runtime?: RuntimeStatus }) {
  return (
    <Panel title="系统运行状态">
      <div className="flex flex-col divide-y divide-border-subtle">
        <Status label="数据库" ok={runtime?.database} />
        <Status label="Redis" ok={runtime?.redis} />
        <Status label="对象存储" ok={runtime?.s3_configured} />
        <div className="flex items-center justify-between gap-4 py-3">
          <span className="text-base text-text-primary">搜索后端</span>
          <span className="text-sm text-text-muted">{runtime?.search_backend ?? 'unknown'}</span>
        </div>
      </div>
    </Panel>
  )
}

function CreateOrgPanel({ orgs, perform, acting }: { orgs: Org[]; perform: AdminContext['perform']; acting: string | null }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState('')
  const [orgType, setOrgType] = useState('department')
  return (
    <Panel title="新建组织">
      <form className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault()
        void perform('新建组织', () => apiPost('/orgs', { name, code, parent_id: parentId || undefined, org_type: orgType }))
      }}>
        <Input label="组织名称" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input label="组织编码" value={code} onChange={(event) => setCode(event.target.value)} required />
        <Select label="上级组织" value={parentId} onChange={(event) => setParentId(event.target.value)} options={[{ value: '', label: '根组织' }].concat(orgs.map((org) => ({ value: org.id, label: org.name })))} />
        <Select label="组织类型" value={orgType} onChange={(event) => setOrgType(event.target.value)} options={[
          { value: 'company', label: '公司' },
          { value: 'center', label: '中心' },
          { value: 'department', label: '部门' },
          { value: 'studio', label: '创新工作室' },
        ]} />
        <Button disabled={acting === '新建组织'}>创建组织</Button>
      </form>
    </Panel>
  )
}

function CreatePersonPanel({ orgs, roles, perform, acting }: { orgs: Org[]; roles: Role[]; perform: AdminContext['perform']; acting: string | null }) {
  const [name, setName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [employeeNo, setEmployeeNo] = useState('')
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '')
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  return (
    <Panel title="新建人员">
      <form className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault()
        void perform('新建人员', () => apiPost('/users', {
          name,
          login_name: loginName || undefined,
          employee_no: employeeNo || undefined,
          primary_org_id: orgId,
          system_role_ids: roleId ? [roleId] : [],
          account_status: 'enabled',
          daily_standard_hours: 8,
        }))
      }}>
        <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input label="登录账号" value={loginName} onChange={(event) => setLoginName(event.target.value)} />
        <Input label="工号" value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} />
        <Select label="主组织" value={orgId} onChange={(event) => setOrgId(event.target.value)} options={orgs.map((org) => ({ value: org.id, label: org.name }))} required />
        <Select label="默认角色" value={roleId} onChange={(event) => setRoleId(event.target.value)} options={roles.map((role) => ({ value: role.id, label: role.name }))} />
        <Button disabled={!orgId || acting === '新建人员'}>创建人员</Button>
      </form>
    </Panel>
  )
}

function EditPersonPanel({ person, orgs, roles, perform, acting, onClose }: { person: ApiPerson; orgs: Org[]; roles: Role[]; perform: AdminContext['perform']; acting: string | null; onClose: () => void }) {
  const [name, setName] = useState(person.name)
  const [orgId, setOrgId] = useState(person.primary_org_id ?? '')
  const [roleId, setRoleId] = useState('')
  const [workStatus, setWorkStatus] = useState(person.work_status ?? 'active')
  const [reason, setReason] = useState('')
  return (
    <Panel title="人员全量编辑">
      <form className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault()
        void perform('保存人员', () => apiPatch(`/users/${person.id}`, {
          name,
          primary_org_id: orgId || undefined,
          system_role_ids: roleId ? [roleId] : undefined,
          work_status: workStatus,
          reason,
        })).then(onClose)
      }}>
        <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} />
        <Select label="主组织" value={orgId} onChange={(event) => setOrgId(event.target.value)} options={orgs.map((org) => ({ value: org.id, label: org.name }))} />
        <Select label="角色权限" value={roleId} onChange={(event) => setRoleId(event.target.value)} options={[{ value: '', label: '不变更角色' }].concat(roles.map((role) => ({ value: role.id, label: role.name })))} />
        <Select label="工作状态" value={workStatus} onChange={(event) => setWorkStatus(event.target.value)} options={[
          { value: 'active', label: '在岗' },
          { value: 'business_trip', label: '出差' },
          { value: 'leave', label: '休假' },
          { value: 'inactive', label: '离岗' },
        ]} />
        <Input label="审计备注" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="修改组织或角色时填写原因" />
        <div className="flex gap-3">
          <Button disabled={acting === '保存人员'}>保存</Button>
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
        </div>
      </form>
    </Panel>
  )
}

function TemplateForm({ template, orgs, roles, perform, acting, onClear }: { template: InvitationTemplate | null; orgs: Org[]; roles: Role[]; perform: AdminContext['perform']; acting: string | null; onClear: () => void }) {
  const [name, setName] = useState(template?.name ?? '')
  const [orgId, setOrgId] = useState(template?.default_org_id ?? orgs[0]?.id ?? '')
  const [roleId, setRoleId] = useState(template?.default_role_ids?.[0] ?? roles[0]?.id ?? '')
  const [needApproval, setNeedApproval] = useState(template?.need_approval === false ? 'false' : 'true')
  const [expires, setExpires] = useState(String(template?.expires_in_days ?? 7))
  const [maxUses, setMaxUses] = useState(String(template?.max_uses ?? 1))

  return (
    <Panel title={template ? '编辑邀请模板' : '新建邀请模板'}>
      <form className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault()
        const payload = {
          name,
          invite_type: 'user',
          default_org_id: orgId,
          default_role_ids: roleId ? [roleId] : [],
          need_approval: needApproval === 'true',
          required_fields: ['name', 'login_name', 'password'],
          expires_in_days: Number(expires),
          max_uses: Number(maxUses),
          status: 'enabled',
        }
        void perform(template ? '编辑邀请模板' : '新建邀请模板', () => template ? apiPatch(`/invitations/templates/${template.id}`, payload) : apiPost('/invitations/templates', payload)).then(onClear)
      }}>
        <Input label="邀请名称" value={name} onChange={(event) => setName(event.target.value)} required />
        <Select label="默认组织" value={orgId} onChange={(event) => setOrgId(event.target.value)} options={orgs.map((org) => ({ value: org.id, label: org.name }))} />
        <Select label="默认角色" value={roleId} onChange={(event) => setRoleId(event.target.value)} options={roles.map((role) => ({ value: role.id, label: role.name }))} />
        <Select label="审核策略" value={needApproval} onChange={(event) => setNeedApproval(event.target.value)} options={[
          { value: 'true', label: '需要审核' },
          { value: 'false', label: '免审核' },
        ]} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="有效期天数" type="number" min={1} value={expires} onChange={(event) => setExpires(event.target.value)} />
          <Input label="最大使用次数" type="number" min={1} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
        </div>
        <div className="flex gap-3">
          <Button disabled={!orgId || !roleId || acting === '新建邀请模板' || acting === '编辑邀请模板'}>{template ? '保存模板' : '创建模板'}</Button>
          {template && <Button type="button" variant="ghost" onClick={onClear}>取消编辑</Button>}
        </div>
      </form>
    </Panel>
  )
}

function RegistrationRows({ registrations, compact }: { registrations: Registration[]; compact?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {registrations.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-medium text-text-primary">{String(item.payload?.name ?? item.person_id ?? '注册申请')}</span>
            <span className="text-sm text-text-muted">{String(item.payload?.login_name ?? item.account_id ?? '-')} · {formatDateTime(item.created_at)}</span>
          </div>
          <RegistrationTag status={item.status} />
        </div>
      ))}
      {registrations.length === 0 && compact && <EmptyState title="暂无待审核注册" desc="当前没有待处理注册。" />}
    </div>
  )
}

function RegistrationTag({ status }: { status?: string }) {
  return <Tag variant={status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'warning'}>{status ?? 'pending'}</Tag>
}

function AuditRows({ audits }: { audits: AuditLog[] }) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {audits.map((audit) => (
        <div key={audit.id} className="flex flex-col gap-0.5 py-3">
          <span className="text-base font-medium text-text-primary">{audit.action ?? '审计动作'}</span>
          <span className="text-sm text-text-muted">{audit.object_type ?? 'object'} · {formatDateTime(audit.created_at)}</span>
        </div>
      ))}
      {audits.length === 0 && <EmptyState title="暂无审计" desc="当前没有审计记录。" />}
    </div>
  )
}

function Status({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-base text-text-primary">{label}</span>
      <Tag variant={ok ? 'success' : 'warning'}>{ok ? '正常' : '未就绪'}</Tag>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-base font-medium text-text-primary">{value}</span>
    </div>
  )
}

function orgName(orgs: Org[], id?: string | null) {
  return orgs.find((org) => org.id === id)?.name ?? id ?? '未配置'
}

function templateName(templates: InvitationTemplate[], id?: string) {
  return templates.find((template) => template.id === id)?.name ?? id ?? '-'
}

function roleNames(roles: Role[], value: unknown) {
  const ids = Array.isArray(value) ? value.map(String) : []
  if (ids.length === 0) return '未配置'
  return ids.map((id) => roles.find((role) => role.id === id)?.name ?? id).join('、')
}
