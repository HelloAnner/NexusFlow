import { Button, EmptyState, Panel, Select, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { useState } from 'react'
import type { AdminContext } from '../types'
import { RegistrationTag } from '../components'

export function PendingView({ registrations, acting, reviewRegistration, loading }: AdminContext) {
  const [status, setStatus] = useState('pending')
  const filtered = registrations.filter((item) => status === 'all' || (item.status ?? 'pending') === status)
  return (
    <Panel title="待审核注册">
      <div className="flex items-center gap-3">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} options={[
          { value: 'pending', label: '待审核' },
          { value: 'approved', label: '已通过' },
          { value: 'rejected', label: '已拒绝' },
          { value: 'all', label: '全部' },
        ]} />
      </div>
      <Table>
        <Thead><Tr><Th>姓名</Th><Th>账号</Th><Th>联系</Th><Th>状态</Th><Th>注册时间</Th><Th>审核意见</Th><Th>操作</Th></Tr></Thead>
        <Tbody>
          {filtered.map((item) => (
            <Tr key={item.id}>
              <Td>{String(item.payload?.name ?? item.person_id ?? '注册申请')}</Td>
              <Td>{String(item.payload?.login_name ?? item.account_id ?? '-')}</Td>
              <Td>{String(item.payload?.contact ?? item.payload?.employee_no ?? '-')}</Td>
              <Td><RegistrationTag status={item.status} /></Td>
              <Td>{formatDateTime(item.created_at)}</Td>
              <Td>{item.review_comment || '-'}</Td>
              <Td>
                {item.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button className="h-8 px-3 text-sm" disabled={acting === '审核通过'} onClick={() => void reviewRegistration(item.id, 'approve')}>通过</Button>
                    <Button variant="danger" className="h-8 px-3 text-sm" disabled={acting === '审核拒绝'} onClick={() => void reviewRegistration(item.id, 'reject')}>拒绝</Button>
                  </div>
                ) : '-'}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {!loading && filtered.length === 0 && <EmptyState title="暂无注册申请" desc="当前筛选下没有注册申请。" />}
    </Panel>
  )
}
