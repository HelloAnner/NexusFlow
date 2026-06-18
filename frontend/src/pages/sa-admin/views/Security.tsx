import { Button, EmptyState, Panel, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiPost } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { AdminContext } from '../types'
import { AccountTag } from '../components'

export function SecurityView({ accounts, perform, acting, loading }: AdminContext) {
  return (
    <Panel title="账号安全">
      <Table>
        <Thead><Tr><Th>账号</Th><Th>状态</Th><Th>失败次数</Th><Th>最近登录</Th><Th>创建时间</Th><Th>操作</Th></Tr></Thead>
        <Tbody>
          {accounts.map((account) => (
            <Tr key={account.id}>
              <Td>{account.login_name}</Td>
              <Td><AccountTag status={account.status} /></Td>
              <Td>{account.failed_login_count ?? 0}</Td>
              <Td>{formatDateTime(account.last_login_at)}</Td>
              <Td>{formatDateTime(account.created_at)}</Td>
              <Td>
                <div className="flex gap-2">
                  <Button variant="danger" className="h-8 px-3 text-sm" disabled={acting === '禁用账号' || account.status === 'disabled'} onClick={() => void perform('禁用账号', () => apiPost(`/admin/accounts/${account.id}/disable`))}>禁用</Button>
                  <Button variant="secondary" className="h-8 px-3 text-sm" disabled={acting === '解锁账号'} onClick={() => void perform('解锁账号', () => apiPost(`/admin/accounts/${account.id}/unlock`))}>解锁</Button>
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {!loading && accounts.length === 0 && <EmptyState title="暂无账号" desc="当前没有账号记录。" />}
      <p className="text-sm text-text-muted">重置密码、强制下线、解绑登录方式尚无后端接口，本页不再放置无响应按钮。</p>
    </Panel>
  )
}
