import { Button, Input, Panel, Select } from '@/components/ui'
import { apiPatch, apiPost } from '@/lib/api'
import { useState } from 'react'
import type { AdminContext, InvitationTemplate, Org, Role } from '../types'

export function TemplateForm({ template, orgs, roles, perform, acting, onClear }: { template: InvitationTemplate | null; orgs: Org[]; roles: Role[]; perform: AdminContext['perform']; acting: string | null; onClear: () => void }) {
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
