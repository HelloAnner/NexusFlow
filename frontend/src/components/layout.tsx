import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CheckSquare,
  BarChart3,
  Folder,
  Users,
  AlertCircle,
  FileText,
  Wrench,
  Settings,
  Shield,
  Plus,
} from 'lucide-react'
import { NavItem, SearchInput, Button, Avatar } from '@/components/ui'
import { Link, useLocation } from 'react-router-dom'

const mainNav = [
  { path: '/', label: '首页', icon: LayoutDashboard },
  { path: '/tasks', label: '任务', icon: CheckSquare },
  { path: '/gantt', label: '甘特图', icon: BarChart3 },
  { path: '/projects', label: '项目', icon: Folder },
  { path: '/people', label: '人员', icon: Users },
  { path: '/conflicts', label: '冲突中心', icon: AlertCircle },
  { path: '/resources', label: '资料库', icon: FileText },
  { path: '/tools', label: '工具台', icon: Wrench },
  { path: '/config', label: '配置中心', icon: Settings },
]

export function Sidebar({ className }: { className?: string }) {
  const location = useLocation()
  return (
    <aside
      className={cn(
        'flex h-screen w-[220px] flex-col border-r border-border-subtle bg-bg-tertiary px-4 py-5',
        className
      )}
    >
      <Link to="/" className="mb-6 flex items-center gap-3 px-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-primary-text">
          <span className="text-sm font-bold">N</span>
        </span>
        <span className="text-lg font-bold text-text-primary">NexusFlow</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {mainNav.map((item) => (
          <Link key={item.path} to={item.path} className="w-full">
            <NavItem icon={item.icon} label={item.label} active={location.pathname === item.path} />
          </Link>
        ))}
      </nav>

      <div className="mt-4 border-t border-border-subtle pt-4">
        <Link to="/admin" className="w-full">
          <NavItem icon={Shield} label="系统管理" active={location.pathname === '/admin'} />
        </Link>
      </div>
    </aside>
  )
}

export interface TopHeaderProps {
  title: string
  subtitle?: string
  className?: string
}
export function TopHeader({ title, subtitle, className }: TopHeaderProps) {
  return (
    <header className={cn('flex h-[70px] items-center justify-between px-8 py-4', className)}>
      <div className="flex flex-col">
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {subtitle && <span className="text-sm text-text-muted">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-4">
        <SearchInput placeholder="搜索任务、项目、人员..." className="w-64" />
        <Button className="h-10 px-4">
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
        <Avatar name="张" className="h-9 w-9" />
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
