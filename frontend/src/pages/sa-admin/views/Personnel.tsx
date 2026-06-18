import { EmptyState, Panel, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { accountStatusLabel, workStatusLabel } from '@/lib/format'
import { useState } from 'react'
import type { AdminContext } from '../types'
import type { ApiPerson } from '@/lib/format'
import { orgName, roleNames } from '../components'
import { CreateOrgPanel, CreatePersonPanel, EditPersonPanel } from '../forms'

export function PersonnelView({ people, roles, orgs, perform, acting, loading }: AdminContext) {
  const [selected, setSelected] = useState<ApiPerson | null>(null)
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <Panel title="SA 人员管理">
        <Table>
          <Thead><Tr><Th>姓名</Th><Th>登录账号</Th><Th>主组织</Th><Th>角色</Th><Th>工作状态</Th><Th>账号状态</Th><Th>操作</Th></Tr></Thead>
          <Tbody>
            {people.map((person) => (
              <Tr key={person.id}>
                <Td>{person.name}</Td>
                <Td>{person.account_id ?? '-'}</Td>
                <Td>{orgName(orgs, person.primary_org_id)}</Td>
                <Td>{roleNames(roles, person.system_role_ids ?? person.payload?.role_ids)}</Td>
                <Td>{workStatusLabel(person.work_status)}</Td>
                <Td><Tag variant={person.account_status === 'enabled' ? 'success' : person.account_status === 'pending' ? 'warning' : 'error'}>{accountStatusLabel(person.account_status)}</Tag></Td>
                <Td><button className="text-sm text-text-muted hover:text-text-primary" onClick={() => setSelected(person)}>编辑全量信息</button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!loading && people.length === 0 && <EmptyState title="暂无人员" desc="当前没有可管理人员。" />}
      </Panel>
      <div className="flex flex-col gap-6">
        <CreateOrgPanel orgs={orgs} perform={perform} acting={acting} />
        <CreatePersonPanel orgs={orgs} roles={roles} perform={perform} acting={acting} />
        {selected && <EditPersonPanel person={selected} orgs={orgs} roles={roles} perform={perform} acting={acting} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
