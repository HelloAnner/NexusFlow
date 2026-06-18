import { Button, Input, Panel, Select } from '@/components/ui'
import { apiPatch } from '@/lib/api'
import { useState } from 'react'
import type { AdminContext, Org, Role } from '../types'
import type { ApiPerson } from '@/lib/format'

export function EditPersonPanel({ person, orgs, roles, perform, acting, onClose }: { person: ApiPerson; orgs: Org[]; roles: Role[]; perform: AdminContext['perform']; acting: string | null; onClose: () => void }) {
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
