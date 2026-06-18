import {
  Activity,
  FileText,
  LayoutDashboard,
  Link as LinkIcon,
  Mail,
  Save,
  Settings,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react'

export const secondaryNav = [
  { id: 'overview', label: '总览' },
  { id: 'appearance', label: '系统外观' },
  { id: 'pending', label: '待审核注册' },
  { id: 'personnel', label: '人员管理' },
  { id: 'templates', label: '邀请模板' },
  { id: 'links', label: '邀请链接' },
  { id: 'role-entry', label: '角色入口' },
  { id: 'security', label: '账号安全' },
  { id: 'audit', label: '审计日志' },
  { id: 'status', label: '运行状态' },
]

export const navIcons: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  appearance: Settings,
  pending: UserCheck,
  personnel: Users,
  templates: Mail,
  links: LinkIcon,
  'role-entry': UserCog,
  security: ShieldCheck,
  audit: FileText,
  status: Activity,
}

export { Save }
