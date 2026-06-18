import { EmptyState, Input, Panel, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { useState } from 'react'
import type { AdminContext } from '../types'

export function AuditView({ audits, loading }: AdminContext) {
  const [q, setQ] = useState('')
  const filtered = audits.filter((audit) => !q || `${audit.action ?? ''} ${audit.object_type ?? ''} ${audit.reason ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Panel title="审计日志">
      <Input placeholder="按操作类型、对象类型或原因过滤" value={q} onChange={(event) => setQ(event.target.value)} />
      <Table>
        <Thead><Tr><Th>操作</Th><Th>对象</Th><Th>对象 ID</Th><Th>原因</Th><Th>时间</Th></Tr></Thead>
        <Tbody>
          {filtered.map((audit) => (
            <Tr key={audit.id}>
              <Td>{audit.action ?? '-'}</Td>
              <Td>{audit.object_type ?? '-'}</Td>
              <Td className="font-mono text-xs">{audit.object_id ?? '-'}</Td>
              <Td>{audit.reason || '-'}</Td>
              <Td>{formatDateTime(audit.created_at)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {!loading && filtered.length === 0 && <EmptyState title="暂无审计日志" desc="当前筛选下没有审计记录。" />}
    </Panel>
  )
}
