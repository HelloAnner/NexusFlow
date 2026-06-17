import { MainLayout } from '@/components/layout'
import {
  Avatar,
  Button,
  NavItem,
  Panel,
  StatCard,
  Table,
  Tag,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import {
  Activity,
  Building2,
  FileText,
  LayoutDashboard,
  Link as LinkIcon,
  Mail,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import {
  adminStats,
  auditRisks,
  invitationTemplates,
  pendingRegistrations,
  personnel,
  roleEntries,
  secondaryNav,
  systemServices,
} from '@/mocks/saAdmin'

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

export default function SAAdminPage() {
  const [activeNav, setActiveNav] = useState('overview')

  return (
    <MainLayout title="系统管理" subtitle="平台级运营与监控">
      <div className="flex h-full gap-6">
        {/* Secondary Sidebar */}
        <aside className="flex w-[220px] shrink-0 flex-col rounded-lg border border-border-subtle bg-bg-secondary p-4">
          <div className="mb-1 px-3">
            <h2 className="text-lg font-semibold text-text-primary">系统管理</h2>
            <p className="text-sm text-text-muted">平台级运营与监控</p>
          </div>
          <div className="my-2 h-2" />
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {secondaryNav.map((item) => (
              <NavItem
                key={item.id}
                icon={navIcons[item.id] ?? LayoutDashboard}
                label={item.label}
                active={activeNav === item.id}
                onClick={() => setActiveNav(item.id)}
              />
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

        {/* Content Area */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {/* Admin Stats */}
          <div className="grid grid-cols-6 gap-4">
            <StatCard label="租户" value={adminStats.tenants} />
            <StatCard label="用户" value={adminStats.users} />
            <StatCard label="在线" value={adminStats.online} />
            <StatCard label="健康度" value={adminStats.health} />
            <StatCard label="待审核注册" value={adminStats.pendingRegistrations} />
            <StatCard label="有效邀请" value={adminStats.activeInvitations} />
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-4">
            <Button variant="secondary" className="h-10 px-4">
              <Building2 className="h-4 w-4" />
              新建组织
            </Button>
            <Button variant="secondary" className="h-10 px-4">
              <UserPlus className="h-4 w-4" />
              新建人员
            </Button>
            <Button className="h-10 px-4">
              <LinkIcon className="h-4 w-4" />
              生成邀请链接
            </Button>
            <Button variant="secondary" className="h-10 px-4">
              <FileText className="h-4 w-4" />
              查看审计日志
            </Button>
          </div>

          {/* Admin Content */}
          <div className="grid grid-cols-[1fr_380px] gap-6">
            {/* Left Column */}
            <div className="flex flex-col gap-6">
              {/* Pending Registrations */}
              <Panel title="待审核注册">
                <div className="flex flex-col divide-y divide-border-subtle">
                  {pendingRegistrations.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base font-medium text-text-primary">
                          {item.name}
                        </span>
                        <span className="text-sm text-text-muted">
                          {item.dept} · {item.title}
                          {item.template !== '-' ? ` · ${item.template}` : ''}
                        </span>
                      </div>
                      <Tag variant={item.status === '待审核' ? 'info' : 'warning'}>
                        {item.status}
                      </Tag>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button className="h-9 px-4">批量通过</Button>
                  <Button variant="ghost" className="h-9 px-4">
                    查看全部
                  </Button>
                </div>
              </Panel>

              {/* Personnel Management */}
              <Panel title="人员全量管理">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>姓名</Th>
                      <Th>账号</Th>
                      <Th>组织</Th>
                      <Th>角色</Th>
                      <Th>状态</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {personnel.map((p) => (
                      <Tr key={p.id}>
                        <Td>{p.name}</Td>
                        <Td>{p.account}</Td>
                        <Td>{p.org}</Td>
                        <Td>{p.role}</Td>
                        <Td>
                          <Tag
                            variant={
                              p.status === '正常'
                                ? 'success'
                                : p.status === '停用'
                                  ? 'warning'
                                  : 'error'
                            }
                          >
                            {p.status}
                          </Tag>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                <div className="mt-4 flex items-center gap-3">
                  <Button className="h-9 px-4">新增人员</Button>
                  <Button variant="ghost" className="h-9 px-4">
                    管理
                  </Button>
                </div>
              </Panel>

              {/* Invitation Templates */}
              <Panel title="邀请模板管理">
                <div className="flex flex-col divide-y divide-border-subtle">
                  {invitationTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base font-medium text-text-primary">
                          {t.name}
                        </span>
                        <span className="text-sm text-text-muted">{t.desc}</span>
                      </div>
                      <Tag variant={t.status === '启用中' ? 'success' : 'warning'}>
                        {t.status}
                      </Tag>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button className="h-9 px-4">新建模板</Button>
                  <Button variant="ghost" className="h-9 px-4">
                    链接
                  </Button>
                </div>
              </Panel>
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-6">
              {/* System Status */}
              <Panel title="系统运行状态">
                <div className="flex flex-col divide-y divide-border-subtle">
                  {systemServices.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="text-base text-text-primary">{s.label}</span>
                      {s.state ? (
                        <Tag variant="success">{s.state}</Tag>
                      ) : (
                        <span className="text-sm text-text-muted">{s.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Audit Risks */}
              <Panel title="权限审计风险">
                <div className="flex flex-col divide-y divide-border-subtle">
                  {auditRisks.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base font-medium text-text-primary">
                          {r.title}
                        </span>
                        <span className="text-sm text-text-muted">{r.sub}</span>
                      </div>
                      <Tag
                        variant={
                          r.level === 'success'
                            ? 'success'
                            : r.level === 'warning'
                              ? 'warning'
                              : 'error'
                        }
                      >
                        {r.level === 'success'
                          ? '正常'
                          : r.level === 'warning'
                            ? '待审'
                            : '异常'}
                      </Tag>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button variant="ghost" className="h-9 px-4">
                    审计日志
                  </Button>
                </div>
              </Panel>

              {/* Role Entry Config */}
              <Panel title="角色入口配置">
                <div className="flex flex-col divide-y divide-border-subtle">
                  {roleEntries.map((r) => (
                    <div key={r.id} className="flex flex-col gap-0.5 py-3">
                      <span className="text-base font-medium text-text-primary">
                        {r.role}
                      </span>
                      <span className="text-sm text-text-muted">{r.desc}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button className="h-9 px-4">配置</Button>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
