import { EmptyState, Panel, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiPatch, apiPost } from '@/lib/api'
import { useState } from 'react'
import type { AdminContext, InvitationTemplate } from '../types'
import { orgName, roleNames } from '../components'
import { TemplateForm } from '../forms'

export function TemplateView({ templates, orgs, roles, perform, acting, loading }: AdminContext) {
  const [editing, setEditing] = useState<InvitationTemplate | null>(null)
  return (
    <div className="grid grid-cols-[1fr_380px] gap-6">
      <Panel title="邀请模板管理">
        <Table>
          <Thead><Tr><Th>邀请名称</Th><Th>类型</Th><Th>默认组织</Th><Th>默认角色</Th><Th>审核</Th><Th>有效期/次数</Th><Th>状态</Th><Th>操作</Th></Tr></Thead>
          <Tbody>
            {templates.map((template) => (
              <Tr key={template.id}>
                <Td>{template.name ?? '未命名模板'}</Td>
                <Td>{template.invite_type ?? 'user'}</Td>
                <Td>{orgName(orgs, template.default_org_id)}</Td>
                <Td>{roleNames(roles, template.default_role_ids)}</Td>
                <Td>{template.need_approval ? '需要' : '免审'}</Td>
                <Td>{template.expires_in_days ?? 7} 天 / {template.max_uses ?? 1} 次</Td>
                <Td><Tag variant={template.status === 'enabled' ? 'success' : 'warning'}>{template.status ?? 'enabled'}</Tag></Td>
                <Td>
                  <div className="flex gap-2">
                    <button className="text-sm text-text-muted hover:text-text-primary" onClick={() => setEditing(template)}>编辑</button>
                    <button className="text-sm text-text-muted hover:text-text-primary" onClick={() => void perform('生成邀请链接', async () => {
                      const res = await apiPost<{ url: string }>(`/invitations/templates/${template.id}/links`)
                      return `完整邀请链接只展示一次：${res.url}`
                    })}>生成链接</button>
                    <button className="text-sm text-color-error hover:underline" onClick={() => void perform('停用模板', () => apiPatch(`/invitations/templates/${template.id}`, { status: 'disabled' }))}>停用</button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!loading && templates.length === 0 && <EmptyState title="暂无邀请模板" desc="创建模板后才能生成邀请链接。" />}
      </Panel>
      <TemplateForm
        key={`${editing?.id ?? 'new'}-${orgs[0]?.id ?? ''}-${roles[0]?.id ?? ''}`}
        template={editing}
        orgs={orgs}
        roles={roles}
        perform={perform}
        acting={acting}
        onClear={() => setEditing(null)}
      />
    </div>
  )
}
