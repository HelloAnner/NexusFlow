import { Button, EmptyState, Input, Panel, Select, Tag } from '@/components/ui'
import { apiPost } from '@/lib/api'
import { Save } from 'lucide-react'
import { useState } from 'react'
import type { AdminContext } from '../types'

export function RoleEntryView({ roles, perform, acting }: AdminContext) {
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
                <Tag variant={role.enabled === false ? 'warning' : 'success'}>{role.enabled === false ? '停用' : '启用'}</Tag>
              </div>
              <span className="text-sm text-text-muted">{role.code} · {role.role_type ?? 'business'}</span>
              <span className="text-xs text-text-muted">默认首页和导航以最新发布的 role_entry 配置为准。</span>
            </div>
          ))}
        </div>
        {roles.length === 0 && <EmptyState title="暂无角色" desc="当前没有可配置角色。" />}
      </Panel>
    </div>
  )
}
