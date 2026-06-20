import { cn } from '@/lib/utils'
import {
  Home,
  CheckSquare,
  BarChart3,
  Folder,
  Users,
  Building2,
  AlertCircle,
  FileText,
  Wrench,
  Settings,
  Shield,
  Plus,
  Bell,
  Camera,
  LogOut,
  LockKeyhole,
  X,
  Menu,
  ChevronDown,
  Inbox,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  CornerDownLeft,
  Clock3,
  File,
  User,
  Briefcase,
} from 'lucide-react'
import { NavItem, Button, Avatar } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useBranding } from '@/lib/branding'
import { useApiData } from '@/lib/useApiData'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const mainNav = [
  { path: '/', label: '今日', icon: Home, group: 'top' },
  { path: '/todos', label: '收件箱', icon: Inbox, group: 'top', businessOnly: true },
  { path: '/tasks', label: '我的工作', icon: CheckSquare, group: 'top', actions: ['task.create', 'task.dispatch', 'task.accept'] },
  { path: '/projects', label: '项目', icon: Folder, actions: ['project.create', 'project.manage', 'project.manage_member'] },
  { path: '/people', label: '团队', icon: Users, actions: ['person.manage'] },
  { path: '/orgs', label: '组织', icon: Building2, actions: ['org.manage', 'person.manage'] },
  { path: '/gantt', label: '排程', icon: CalendarDays, businessOnly: true },
  { path: '/conflicts', label: '冲突', icon: AlertCircle, actions: ['task.dispatch', 'task.approve'] },
  { path: '/resources', label: '资料', icon: FileText, actions: ['resource.upload', 'resource.download'] },
  { path: '/reports', label: '报表', icon: BarChart3, actions: ['report.export'] },
  { path: '/tools', label: '工具', icon: Wrench, group: 'system', businessOnly: true },
  { path: '/config', label: '设置', icon: Settings, group: 'system', actions: ['config.publish', 'admin.manage'] },
  { path: '/permissions', label: '权限', icon: LockKeyhole, group: 'system', actions: ['admin.manage'] },
]

interface PermissionResponse {
  roles?: string[]
  actions?: string[]
  pending?: boolean
}

function canAccess(
  item: (typeof mainNav)[number],
  permissions: PermissionResponse,
  fallbackActions: string[] = []
) {
  if (item.path === '/') return true
  const roles = permissions.roles ?? []
  const actions = permissions.actions ?? fallbackActions
  if (roles.includes('sa')) return true
  if (permissions.pending) return false
  if ('actions' in item && item.actions) {
    return item.actions.some((action) => actions.includes(action))
  }
  return !('businessOnly' in item) || item.businessOnly
}

export function Sidebar({
  className,
  collapsed = false,
  onToggleCollapsed,
}: {
  className?: string
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const location = useLocation()
  const { user } = useAuth()
  const { branding } = useBranding()
  const { data } = useApiData<PermissionResponse>(() => apiGet('/permissions/me'), [])
  const permissions = data ?? {
    roles: user?.role_codes ?? [],
    actions: user?.actions ?? [],
    pending: user?.account_status === 'pending' || user?.role_codes.includes('pending'),
  }
  const showAdmin =
    permissions.roles?.includes('sa') ||
    permissions.actions?.some((action) => ['admin.manage', 'admin.invitation_manage'].includes(action))
  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-bg-tertiary p-2.5 transition-all duration-normal',
        collapsed ? 'w-[52px]' : 'w-[220px]',
        className
      )}
    >
      <Link to="/" className={cn('mb-5 flex min-w-0 items-center gap-2 px-1.5 pt-1', collapsed && 'justify-center px-0')} title={branding.product_name}>
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-primary-fill text-primary-text">
          <span className="text-xs font-bold">{branding.product_name.charAt(0)}</span>
        </span>
        {!collapsed && <span className="min-w-0 truncate text-base font-bold text-text-primary">{branding.product_name}</span>}
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavGroup
          items={mainNav.filter((item) => (item.group ?? 'work') === 'top')}
          permissions={permissions}
          fallbackActions={user?.actions ?? []}
          pathname={location.pathname}
          collapsed={collapsed}
        />
        <NavGroup
          label="工作"
          items={mainNav.filter((item) => (item.group ?? 'work') === 'work')}
          permissions={permissions}
          fallbackActions={user?.actions ?? []}
          pathname={location.pathname}
          collapsed={collapsed}
        />
        <NavGroup
          label="系统"
          items={mainNav.filter((item) => item.group === 'system')}
          permissions={permissions}
          fallbackActions={user?.actions ?? []}
          pathname={location.pathname}
          collapsed={collapsed}
        />
      </nav>

      {showAdmin && (
        <div className="mt-2">
          <Link to="/admin" className="w-full">
            <NavItem icon={Shield} label="后台" active={location.pathname === '/admin'} compact={collapsed} />
          </Link>
        </div>
      )}
      <button
        type="button"
        className={cn(
          'mt-2 flex h-10 items-center rounded-md text-sm font-medium text-text-muted hover:bg-hover-bg',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5'
        )}
        title={collapsed ? '展开' : '收起'}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        {!collapsed && '收起'}
      </button>
    </aside>
  )
}

function NavGroup({
  label,
  items,
  permissions,
  fallbackActions,
  pathname,
  collapsed,
}: {
  label?: string
  items: typeof mainNav
  permissions: PermissionResponse
  fallbackActions: string[]
  pathname: string
  collapsed: boolean
}) {
  const visibleItems = items.filter((item) => canAccess(item, permissions, fallbackActions))
  if (!visibleItems.length) return null
  return (
    <div className="mb-3 flex flex-col gap-1">
      {label && !collapsed && <div className="px-0.5 py-1 text-xs font-semibold text-text-muted">{label}</div>}
      {visibleItems.map((item) => (
        <Link key={item.path} to={item.path} className="w-full">
          <NavItem
            icon={item.icon}
            label={item.label}
            active={pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))}
            compact={collapsed}
          />
        </Link>
      ))}
    </div>
  )
}

export interface TopHeaderProps {
  title: string
  subtitle?: string
  className?: string
  onMenuClick?: () => void
  onOpenCommand?: () => void
}
export function TopHeader({ className, onMenuClick, onOpenCommand }: TopHeaderProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const profileKey = `nexusflow.profile.${user?.account_id ?? 'anonymous'}`
  const [profileOpen, setProfileOpen] = useState(false)
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(`${profileKey}.name`) || user?.login_name || '用户')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => localStorage.getItem(`${profileKey}.avatar`))
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const isSa = user?.role_codes.includes('sa')
  const headerAction =
    location.pathname.startsWith('/tasks') && location.pathname !== '/tasks/new' && (isSa || user?.actions.includes('task.create'))
      ? { to: '/tasks/new', label: '新建任务' }
      : location.pathname.startsWith('/projects') && (isSa || user?.actions.includes('project.create'))
        ? { to: '/projects?create=1', label: '新建项目' }
        : null

  function saveProfile() {
    const nextName = displayName.trim() || user?.login_name || '用户'
    localStorage.setItem(`${profileKey}.name`, nextName)
    setDisplayName(nextName)
    setProfileMessage('个人信息已保存')
  }

  function handleAvatarFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const nextUrl = typeof reader.result === 'string' ? reader.result : null
      if (!nextUrl) return
      localStorage.setItem(`${profileKey}.avatar`, nextUrl)
      setAvatarUrl(nextUrl)
      setProfileMessage('头像已更新')
    }
    reader.readAsDataURL(file)
  }

  function clearAvatar() {
    localStorage.removeItem(`${profileKey}.avatar`)
    setAvatarUrl(null)
    setProfileMessage('头像已移除')
  }

  return (
    <header className={cn('flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-secondary px-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary lg:hidden"
            aria-label="打开导航"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <span className="font-semibold text-text-primary">NexusFlow</span>
          <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-hover-bg">
            研发中心
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          </button>
        </div>
      </div>
      <button
        type="button"
        className="hidden h-9 w-[min(320px,36vw)] items-center gap-2 rounded-md border border-border-subtle bg-bg-tertiary px-3 text-left text-base text-text-placeholder transition-fast hover:bg-hover-bg focus:border-text-muted focus:outline-none sm:inline-flex"
        onClick={onOpenCommand}
      >
        <Search className="h-4 w-4 shrink-0 text-text-placeholder" />
        <span className="min-w-0 flex-1 truncate">Cmd + K 搜索或跳转...</span>
        <span className="rounded-sm bg-bg-secondary px-1.5 py-0.5 text-xs text-text-muted">K</span>
      </button>
      <div className="flex min-w-0 items-center gap-2">
        {headerAction && (
          <Link to={headerAction.to}>
            <Button className="h-8 px-3">
              <Plus className="h-4 w-4" />
              新建
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
        {!headerAction && (
          <Link to="/tasks/new">
            <Button className="h-8 px-3">
              <Plus className="h-4 w-4" />
              新建
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
        <Link
          to="/notifications"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md bg-bg-tertiary text-text-secondary hover:bg-hover-bg"
          aria-label="通知中心"
        >
          <Bell className="h-4 w-4" />
        </Link>
        <button
          className="rounded-full transition-fast hover:bg-hover-bg"
          onClick={() => setProfileOpen(true)}
          title="个人信息"
        >
          <Avatar name={displayName} src={avatarUrl} className="h-7 w-7" />
        </button>
      </div>

      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20 px-6 py-5">
          <div className="w-[420px] rounded-lg border border-border-subtle bg-bg-primary p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">个人信息</h2>
                <p className="mt-1 text-sm text-text-muted">{user?.account_status ?? 'enabled'}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary"
                aria-label="关闭个人信息"
                onClick={() => setProfileOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 border-b border-border-subtle pb-5">
              <Avatar name={displayName} src={avatarUrl} className="h-16 w-16 text-xl" />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) handleAvatarFile(file)
                  }}
                />
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" onClick={() => avatarInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  更换头像
                </Button>
                {avatarUrl && (
                  <Button variant="ghost" className="h-9 px-3 py-0 text-sm" onClick={clearAvatar}>
                    移除
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-text-muted">
                显示名称
                <input
                  className="w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <ProfileField label="账号" value={user?.login_name ?? '未设置'} />
                <ProfileField label="人员 ID" value={user?.person_id ?? '未绑定'} />
                <ProfileField label="账号 ID" value={user?.account_id ?? '未知'} />
                <ProfileField label="角色" value={user?.role_codes.join('、') || '未分配'} />
              </div>
              {profileMessage && <div className="rounded-md bg-color-success-bg px-3 py-2 text-sm text-color-success">{profileMessage}</div>}
              <div className="flex items-center justify-between border-t border-border-subtle pt-4">
                <Button variant="secondary" className="h-10 px-4" onClick={saveProfile}>
                  保存
                </Button>
                <Button variant="danger" className="h-10 px-4" onClick={() => void logout()}>
                  <LogOut className="h-4 w-4" />
                  退出登录
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-bg-tertiary p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}

interface SearchResult {
  object_type: string
  object_id: string
  title: string
  summary?: string
  status?: string | null
  target_url?: string
}

interface CommandItem {
  id: string
  group: 'navigate' | 'actions' | 'recent' | 'results'
  label: string
  meta?: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  keywords?: string[]
}

const commandGroupLabels: Record<CommandItem['group'], string> = {
  navigate: '快捷导航',
  actions: '操作',
  recent: '最近访问',
  results: '搜索结果',
}

const actionCommands: CommandItem[] = [
  { id: 'new-task', group: 'actions', label: '新建任务', meta: '/new task', path: '/tasks/new', icon: Plus, keywords: ['/new task', 'new task', '创建任务'] },
  { id: 'new-project', group: 'actions', label: '新建项目', meta: '/new project', path: '/projects?create=1', icon: Folder, keywords: ['/new project', 'new project', '创建项目'] },
  { id: 'upload-file', group: 'actions', label: '上传资料', meta: '/upload file', path: '/resources?upload=1', icon: FileText, keywords: ['/upload file', '上传资料'] },
  { id: 'invite-people', group: 'actions', label: '邀请人员', meta: '/invite people', path: '/admin?view=links', icon: Users, keywords: ['/invite people', '邀请人员'] },
]

const routeAliases: Record<string, string[]> = {
  '/': ['/go home', 'home'],
  '/todos': ['/go inbox', 'inbox'],
  '/tasks': ['/go work', '/go tasks', 'my work', 'tasks'],
  '/projects': ['/go projects', 'projects'],
  '/people': ['/go team', 'team'],
  '/orgs': ['/go orgs', 'orgs'],
  '/gantt': ['/go schedule', 'schedule'],
  '/conflicts': ['/go conflicts', 'conflicts'],
  '/resources': ['/go files', 'files'],
  '/reports': ['/go reports', 'reports'],
  '/tools': ['/go tools', 'tools'],
  '/config': ['/go settings', 'settings'],
  '/permissions': ['/go permissions', 'permissions'],
}

function resultIcon(type: string) {
  if (type === 'task') return CheckSquare
  if (type === 'project') return Briefcase
  if (type === 'person') return User
  if (type === 'resource') return File
  return Search
}

function getRecentCommands(): CommandItem[] {
  const raw = localStorage.getItem('nexusflow.command.recent')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as CommandItem[]
    return parsed.slice(0, 8).map((item) => ({ ...item, group: 'recent', icon: Clock3 }))
  } catch {
    localStorage.removeItem('nexusflow.command.recent')
    return []
  }
}

function saveRecentCommand(item: CommandItem) {
  const nextItem = {
    id: item.id,
    group: 'recent' as const,
    label: item.label,
    meta: item.meta,
    path: item.path,
    icon: Clock3,
  }
  const rest = getRecentCommands().filter((recent) => recent.path !== item.path)
  localStorage.setItem('nexusflow.command.recent', JSON.stringify([nextItem, ...rest].slice(0, 8)))
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [recent, setRecent] = useState<CommandItem[]>(() => getRecentCommands())
  const q = query.trim().toLowerCase()
  const isSlashCommand = q.startsWith('/')
  const canSearch = q.length >= 2 && !isSlashCommand

  const navigateCommands = useMemo<CommandItem[]>(() => {
    const permissions: PermissionResponse = {
      roles: user?.role_codes ?? [],
      actions: user?.actions ?? [],
      pending: user?.account_status === 'pending' || user?.role_codes.includes('pending'),
    }
    return mainNav
      .filter((item) => canAccess(item, permissions, user?.actions ?? []))
      .map((item) => ({
        id: `nav-${item.path}`,
        group: 'navigate' as const,
        label: item.label,
        meta: item.path === '/' ? '今日工作台' : item.path,
        path: item.path,
        icon: item.icon,
        keywords: [`/go ${item.label}`, item.label, item.path, ...(routeAliases[item.path] ?? [])],
      }))
  }, [user])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setQuery('')
      setSelected(0)
      setRecent(getRecentCommands())
      inputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open || !canSearch) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearching(true)
      setSearchError(null)
      apiGet<{ items: SearchResult[] }>('/search', { q })
        .then((body) => setResults(body.items ?? []))
        .catch((err) => {
          if (!controller.signal.aborted) setSearchError(err instanceof Error ? err.message : '全局搜索暂不可用')
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 180)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [canSearch, open, q])

  const visibleGroups = useMemo(() => {
    const matches = (item: CommandItem) => {
      if (!q) return true
      return [item.label, item.meta, ...(item.keywords ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    }
    const resultCommands: CommandItem[] = canSearch ? results.map((item) => ({
      id: `result-${item.object_type}-${item.object_id}`,
      group: 'results',
      label: item.title,
      meta: item.summary || item.status || item.object_type,
      path: item.target_url || '/',
      icon: resultIcon(item.object_type),
      keywords: [item.object_type, item.object_id, item.status ?? ''],
    })) : []
    const groups: { group: CommandItem['group']; items: CommandItem[] }[] = []
    const navItems = navigateCommands.filter(matches)
    const actionItems = actionCommands.filter(matches)
    const recentItems = recent.filter(matches)
    const searchItems = resultCommands.filter(matches)
    if (q && searchItems.length) groups.push({ group: 'results', items: searchItems })
    if (!q && recentItems.length) groups.push({ group: 'recent', items: recentItems })
    if (navItems.length) groups.push({ group: 'navigate', items: navItems })
    if (actionItems.length) groups.push({ group: 'actions', items: actionItems })
    return groups
  }, [canSearch, navigateCommands, q, recent, results])

  const flatItems = visibleGroups.flatMap((group) => group.items)
  const selectedIndex = Math.min(selected, Math.max(0, flatItems.length - 1))

  function execute(item: CommandItem | undefined) {
    if (!item) return
    saveRecentCommand(item)
    setRecent(getRecentCommands())
    onClose()
    if (item.path !== location.pathname) navigate(item.path)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (flatItems.length === 0) return
      setSelected((value) => Math.min(flatItems.length - 1, value + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (flatItems.length === 0) return
      setSelected((value) => Math.max(0, value - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      execute(flatItems[selectedIndex])
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-3 py-16" onMouseDown={onClose}>
      <div
        className="flex max-h-[min(720px,calc(100vh-48px))] w-full max-w-[680px] flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex h-14 items-center gap-3 border-b border-border-subtle px-4">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-lg text-text-primary placeholder:text-text-placeholder focus:outline-none"
            placeholder="搜索或输入命令..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
          />
          <span className="rounded-sm bg-bg-tertiary px-2 py-1 text-xs text-text-muted">Esc</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {searchError && canSearch && (
            <div className="m-2 rounded-md bg-color-warning-bg px-3 py-2 text-sm text-color-warning">
              {searchError}，本地导航仍可使用。
            </div>
          )}
          {visibleGroups.map((group) => (
            <div key={group.group} className="mb-2">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase text-text-muted">{commandGroupLabels[group.group]}</div>
              <div className="flex flex-col">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = flatItems[selectedIndex]?.id === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'grid min-h-10 grid-cols-[28px_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-left transition-fast',
                        active ? 'bg-selected-bg' : 'hover:bg-hover-bg'
                      )}
                      onMouseEnter={() => setSelected(flatItems.findIndex((candidate) => candidate.id === item.id))}
                      onClick={() => execute(item)}
                    >
                      <Icon className="h-4 w-4 text-text-muted" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text-primary">{item.label}</span>
                        {item.meta && <span className="block truncate text-xs text-text-muted">{item.meta}</span>}
                      </span>
                      {active && <CornerDownLeft className="h-4 w-4 text-text-muted" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {!searching && flatItems.length === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="text-sm font-medium text-text-primary">没有匹配结果</div>
              {q && <div className="mt-1 text-sm text-text-muted">可按 Enter 新建搜索：{query}</div>}
            </div>
          )}
          {searching && <div className="px-4 py-3 text-sm text-text-muted">正在搜索...</div>}
        </div>
        <div className="flex min-h-10 items-center justify-between border-t border-border-subtle px-4 text-xs text-text-muted">
          <span>Arrow ↑↓ 选择</span>
          <span>Enter 打开 · Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
}

export function MainLayout({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('nexusflow.sidebar.collapsed') === '1')
  const navigate = useNavigate()

  useEffect(() => {
    localStorage.setItem('nexusflow.sidebar.collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
        return
      }
      if (mod && event.key.toLowerCase() === 'n' && !isEditableElement(event.target)) {
        event.preventDefault()
        navigate('/tasks/new')
      }
    }
    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  }, [navigate])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-primary">
      <Sidebar className="hidden lg:flex" collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <TopHeader title={title} subtitle={subtitle} onMenuClick={() => setMobileNavOpen(true)} onOpenCommand={() => setCommandOpen(true)} />
        <div className={cn('flex-1 overflow-auto px-4 py-7 lg:px-7', className)}>
          <div className="mb-6 flex min-h-10 items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-bold text-text-primary">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
            </div>
          </div>
          {children}
        </div>
      </main>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <div className="h-full w-fit" onClick={(event) => event.stopPropagation()}>
            <Sidebar className="h-full w-[min(280px,86vw)] shadow-2xl" />
          </div>
        </div>
      )}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  )
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full bg-bg-primary">{children}</div>
}
