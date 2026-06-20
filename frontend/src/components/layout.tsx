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
} from 'lucide-react'
import { NavItem, SearchInput, Button, Avatar } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useBranding } from '@/lib/branding'
import { useApiData } from '@/lib/useApiData'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
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

export function Sidebar({ className }: { className?: string }) {
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
      className={cn('flex h-screen w-[220px] flex-col bg-bg-tertiary p-2.5', className)}
    >
      <Link to="/" className="mb-5 flex min-w-0 items-center gap-2 px-1.5 pt-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-primary-fill text-primary-text">
          <span className="text-xs font-bold">{branding.product_name.charAt(0)}</span>
        </span>
        <span className="min-w-0 truncate text-base font-bold text-text-primary">{branding.product_name}</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavGroup
          items={mainNav.filter((item) => (item.group ?? 'work') === 'top')}
          permissions={permissions}
          fallbackActions={user?.actions ?? []}
          pathname={location.pathname}
        />
        <NavGroup
          label="工作"
          items={mainNav.filter((item) => (item.group ?? 'work') === 'work')}
          permissions={permissions}
          fallbackActions={user?.actions ?? []}
          pathname={location.pathname}
        />
        <NavGroup
          label="系统"
          items={mainNav.filter((item) => item.group === 'system')}
          permissions={permissions}
          fallbackActions={user?.actions ?? []}
          pathname={location.pathname}
        />
      </nav>

      {showAdmin && (
        <div className="mt-2">
          <Link to="/admin" className="w-full">
            <NavItem icon={Shield} label="后台" active={location.pathname === '/admin'} />
          </Link>
        </div>
      )}
      <button type="button" className="mt-2 flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-text-muted hover:bg-hover-bg">
        <PanelLeftClose className="h-[18px] w-[18px]" />
        收起
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
}: {
  label?: string
  items: typeof mainNav
  permissions: PermissionResponse
  fallbackActions: string[]
  pathname: string
}) {
  const visibleItems = items.filter((item) => canAccess(item, permissions, fallbackActions))
  if (!visibleItems.length) return null
  return (
    <div className="mb-3 flex flex-col gap-1">
      {label && <div className="px-0.5 py-1 text-xs font-semibold text-text-muted">{label}</div>}
      {visibleItems.map((item) => (
        <Link key={item.path} to={item.path} className="w-full">
          <NavItem icon={item.icon} label={item.label} active={pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))} />
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
}
export function TopHeader({ className, onMenuClick }: TopHeaderProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')
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

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

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
      <form onSubmit={handleSearch} className="hidden sm:block">
          <SearchInput
            placeholder="Cmd + K 搜索或跳转..."
            className="w-[min(320px,36vw)]"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
      </form>
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
  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-primary">
      <Sidebar className="hidden lg:flex" />
      <main className="flex flex-1 flex-col overflow-hidden">
        <TopHeader title={title} subtitle={subtitle} onMenuClick={() => setMobileNavOpen(true)} />
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
    </div>
  )
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full bg-bg-primary">{children}</div>
}
