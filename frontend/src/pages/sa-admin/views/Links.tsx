import { Button, EmptyState, Panel, Select, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiPost } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'
import type { AdminContext } from '../types'
import { templateName } from '../components'

export function LinkView({ templates, links, perform, acting, loading }: AdminContext) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <Panel title="邀请链接管理">
        <Table>
          <Thead><Tr><Th>链接</Th><Th>所属模板</Th><Th>状态</Th><Th>有效期</Th><Th>使用次数</Th><Th>生成人</Th><Th>操作</Th></Tr></Thead>
          <Tbody>
            {links.map((link) => (
              <Tr key={link.id}>
                <Td className="font-mono text-xs">{link.id}</Td>
                <Td>{templateName(templates, link.template_id)}</Td>
                <Td><Tag variant={link.status === 'enabled' ? 'success' : 'warning'}>{link.status ?? 'enabled'}</Tag></Td>
                <Td>{formatDateTime(link.expires_at)}</Td>
                <Td>{link.used_count ?? 0} / {link.max_uses ?? 1}</Td>
                <Td>{link.created_by ?? '-'}</Td>
                <Td><button className="text-sm text-color-error hover:underline" onClick={() => void perform('停用邀请链接', () => apiPost(`/invitations/links/${link.id}/disable`))}>停用</button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!loading && links.length === 0 && <EmptyState title="暂无邀请链接" desc="从右侧选择模板生成邀请链接。" />}
      </Panel>
      <Panel title="生成邀请链接">
        <Select label="邀请模板" value={templateId} onChange={(event) => setTemplateId(event.target.value)} options={templates.map((template) => ({ value: template.id, label: template.name ?? template.id }))} />
        <Button disabled={!templateId || acting === '生成邀请链接'} onClick={() => void perform('生成邀请链接', async () => {
          const res = await apiPost<{ url: string }>(`/invitations/templates/${templateId}/links`)
          return `完整邀请链接只展示一次：${res.url}`
        })}>
          <LinkIcon className="h-4 w-4" />生成链接
        </Button>
        <p className="text-sm text-text-muted">后续列表只展示脱敏记录，完整链接请在生成后立即复制。</p>
      </Panel>
    </div>
  )
}
