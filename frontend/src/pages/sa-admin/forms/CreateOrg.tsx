import { Button, Input, Panel, Select } from '@/components/ui'
import { apiPost } from '@/lib/api'
import { useState } from 'react'
import type { AdminContext, Org } from '../types'

export function CreateOrgPanel({ orgs, perform, acting }: { orgs: Org[]; perform: AdminContext['perform']; acting: string | null }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState('')
  const [orgType, setOrgType] = useState('department')
  return (
    <Panel title="新建组织">
      <form className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault()
        void perform('新建组织', () => apiPost('/orgs', { name, code, parent_id: parentId || undefined, org_type: orgType }))
      }}>
        <Input label="组织名称" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input label="组织编码" value={code} onChange={(event) => setCode(event.target.value)} required />
        <Select label="上级组织" value={parentId} onChange={(event) => setParentId(event.target.value)} options={[{ value: '', label: '根组织' }].concat(orgs.map((org) => ({ value: org.id, label: org.name })))} />
        <Select label="组织类型" value={orgType} onChange={(event) => setOrgType(event.target.value)} options={[
          { value: 'company', label: '公司' },
          { value: 'center', label: '中心' },
          { value: 'department', label: '部门' },
          { value: 'studio', label: '创新工作室' },
        ]} />
        <Button disabled={acting === '新建组织'}>创建组织</Button>
      </form>
    </Panel>
  )
}
