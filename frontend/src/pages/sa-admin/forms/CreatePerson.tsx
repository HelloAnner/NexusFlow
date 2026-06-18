import { Button, Input, Panel, Select } from '@/components/ui'
import { apiPost } from '@/lib/api'
import { useState } from 'react'
import type { AdminContext, Org, Role } from '../types'

export function CreatePersonPanel({ orgs, roles, perform, acting }: { orgs: Org[]; roles: Role[]; perform: AdminContext['perform']; acting: string | null }) {
  const [name, setName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [employeeNo, setEmployeeNo] = useState('')
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '')
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  return (
    <Panel title="新建人员">
      <form className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault()
        void perform('新建人员', () => apiPost('/users', {
          name,
          login_name: loginName || undefined,
          employee_no: employeeNo || undefined,
          primary_org_id: orgId,
          system_role_ids: roleId ? [roleId] : [],
          account_status: 'enabled',
          daily_standard_hours: 8,
        }))
      }}>
        <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input label="登录账号" value={loginName} onChange={(event) => setLoginName(event.target.value)} />
        <Input label="工号" value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} />
        <Select label="主组织" value={orgId} onChange={(event) => setOrgId(event.target.value)} options={orgs.map((org) => ({ value: org.id, label: org.name }))} required />
        <Select label="默认角色" value={roleId} onChange={(event) => setRoleId(event.target.value)} options={roles.map((role) => ({ value: role.id, label: role.name }))} />
        <Button disabled={!orgId || acting === '新建人员'}>创建人员</Button>
      </form>
    </Panel>
  )
}
