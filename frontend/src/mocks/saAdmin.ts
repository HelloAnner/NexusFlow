export const adminStats = {
  tenants: '18',
  users: '1,248',
  online: '86',
  health: '99.9%',
  pendingRegistrations: '3',
  activeInvitations: '12',
}

export type RegistrationStatus = '待审核' | '待补充'

export interface PendingRegistration {
  id: string
  name: string
  dept: string
  title: string
  template: string
  status: RegistrationStatus
}

export const pendingRegistrations: PendingRegistration[] = [
  {
    id: '1',
    name: '王晓明',
    dept: '研发部',
    title: '助理工程师',
    template: '邀请模板 A',
    status: '待审核',
  },
  {
    id: '2',
    name: '李红梅',
    dept: '市场部',
    title: '普通员工',
    template: '邀请模板 B',
    status: '待审核',
  },
  {
    id: '3',
    name: '赵志强',
    dept: '行政部',
    title: '待补充资料',
    template: '-',
    status: '待补充',
  },
]

export interface Personnel {
  id: string
  name: string
  account: string
  org: string
  role: string
  status: '正常' | '停用' | '异常'
}

export const personnel: Personnel[] = [
  { id: '1', name: '李明', account: 'liming', org: '研发部', role: '负责人', status: '正常' },
  { id: '2', name: '王芳', account: 'wangfang', org: '研发部', role: '员工', status: '正常' },
  { id: '3', name: '陈静', account: 'chenjing', org: '行政部', role: '员工', status: '停用' },
  { id: '4', name: '赵强', account: 'zhaoqiang', org: '市场部', role: '员工', status: '异常' },
]

export interface InvitationTemplate {
  id: string
  name: string
  desc: string
  status: '启用中' | '受限'
}

export const invitationTemplates: InvitationTemplate[] = [
  {
    id: '1',
    name: '默认员工模板',
    desc: '自动加入研发部 · 需审核',
    status: '启用中',
  },
  {
    id: '2',
    name: '项目负责人模板',
    desc: '自动加入项目 · 无需审核',
    status: '启用中',
  },
  {
    id: '3',
    name: '外部协作模板',
    desc: '指定范围 · 30天有效期',
    status: '受限',
  },
]

export interface SystemService {
  id: string
  label: string
  state?: '正常'
  value?: string
}

export const systemServices: SystemService[] = [
  { id: '1', label: 'PostgreSQL 数据库', state: '正常' },
  { id: '2', label: 'Redis 缓存', state: '正常' },
  { id: '3', label: '对象存储 (S3)', state: '正常' },
  { id: '4', label: '搜索后端', state: '正常' },
  { id: '5', label: '监听端口', value: '8089' },
  { id: '6', label: '构建版本', value: 'v1.2.0' },
]

export interface AuditRisk {
  id: string
  title: string
  sub: string
  level: 'warning' | 'error' | 'success'
}

export const auditRisks: AuditRisk[] = [
  { id: '1', title: '最近角色变更', sub: '2 次，涉及 3 人', level: 'warning' },
  { id: '2', title: '隐藏项目访问', sub: '1 次异常访问尝试', level: 'error' },
  { id: '3', title: '账号禁用/重置', sub: '5 次，全部已审计', level: 'success' },
]

export interface RoleEntry {
  id: string
  role: string
  desc: string
}

export const roleEntries: RoleEntry[] = [
  { id: '1', role: '中心主任', desc: '首页看板 + 全量视图' },
  { id: '2', role: '部门主任', desc: '部门负载 + 审批待办' },
  { id: '3', role: '项目负责人', desc: '项目任务 + 成员进度' },
  { id: '4', role: '员工', desc: '个人任务 + 今日待办' },
]

export const secondaryNav = [
  { id: 'overview', label: '系统概览' },
  { id: 'pending', label: '待审核注册' },
  { id: 'personnel', label: '人员全量管理' },
  { id: 'templates', label: '邀请模板' },
  { id: 'links', label: '邀请链接' },
  { id: 'role-entry', label: '角色入口配置' },
  { id: 'security', label: '账号安全' },
  { id: 'audit', label: '审计日志' },
  { id: 'status', label: '系统运行状态' },
]
