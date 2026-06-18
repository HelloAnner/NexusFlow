import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
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
  ListTodo,
} from 'lucide-react'
import { NavItem, SearchInput, Button, Avatar } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useBranding } from '@/lib/branding'
import { useApiData } from '@/lib/useApiData'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const mainNav = [
  { path: '/', label: '首页', icon: LayoutDashboard },
  { path: '/tasks', label: '任务', icon: CheckSquare, actions: ['task.create', 'task.dispatch', 'task.accept'] },
  { path: '/gantt', label: '甘特图', icon: BarChart3, businessOnly: true },
  { path: '/projects', label: '项目', icon: Folder, actions: ['project.create', 'project.manage', 'project.manage_member'] },
  { path: '/orgs', label: '组织', icon: Building2, actions: ['org.manage', 'person.manage'] },
  { path: '/people', label: '人员', icon: Users, actions: ['person.manage'] },
  { path: '/conflicts', label: '冲突中心', icon: AlertCircle, actions: ['task.dispatch', 'task.approve'] },
  { path: '/todos', label: '待办中心', icon: ListTodo, businessOnly: true },
  { path: '/notifications', label: '通知中心', icon: Bell, businessOnly: true },
  { path: '/reports', label: '报表中心', icon: BarChart3, actions: ['report.export'] },
  { path: '/resources', label: '资料库', icon: FileText, actions: ['resource.upload', 'resource.download'] },
  { path: '/tools', label: '工具台', icon: Wrench, businessOnly: true },
  { path: '/config', label: '配置中心', icon: Settings, actions: ['config.publish', 'admin.manage'] },
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
      className={cn(
        'flex h-screen w-[220px] flex-col border-r border-border-subtle bg-bg-tertiary px-4 py-5',
        className
      )}
    >
      <Link to="/" className="mb-6 flex min-w-0 items-center gap-3 px-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-primary-text">
          <span className="text-sm font-bold">{branding.product_name.charAt(0)}</span>
        </span>
        <span className="min-w-0 truncate text-lg font-bold text-text-primary">{branding.product_name}</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {mainNav.filter((item) => canAccess(item, permissions, user?.actions ?? [])).map((item) => (
          <Link key={item.path} to={item.path} className="w-full">
            <NavItem icon={item.icon} label={item.label} active={location.pathname === item.path} />
          </Link>
        ))}
      </nav>

      {showAdmin && (
        <div className="mt-4 border-t border-border-subtle pt-4">
          <Link to="/admin" className="w-full">
            <NavItem icon={Shield} label="系统管理" active={location.pathname === '/admin'} />
          </Link>
        </div>
      )}
    </aside>
  )
}

export interface TopHeaderProps {
  title: string
  subtitle?: string
  className?: string
}
export function TopHeader({ title, subtitle, className }: TopHeaderProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const canCreateTask = user?.role_codes.includes('sa') || user?.actions.includes('task.create')

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <header className={cn('flex h-[70px] items-center justify-between px-8 py-4', className)}>
      <div className="flex flex-col">
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {subtitle && <span className="text-sm text-text-muted">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-4">
        <form onSubmit={handleSearch}>
          <SearchInput
            placeholder="搜索任务、项目、人员..."
            className="w-64"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </form>
        {canCreateTask && (
          <Link to="/tasks/new">
            <Button className="h-10 px-4">
              <Plus className="h-4 w-4" />
              新建任务
            </Button>
          </Link>
        )}
        <button
          className="rounded-md px-2 py-1 transition-fast hover:bg-hover-bg"
          onClick={() => void logout()}
          title="退出登录"
        >
          <Avatar name={user?.login_name ?? '用户'} className="h-9 w-9" />
        </button>
      </div>
    </header>
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
  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-primary">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <TopHeader title={title} subtitle={subtitle} />
        <div className={cn('flex-1 overflow-auto px-8 pb-8', className)}>{children}</div>
      </main>
    </div>
  )
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full bg-bg-primary">{children}</div>
}
