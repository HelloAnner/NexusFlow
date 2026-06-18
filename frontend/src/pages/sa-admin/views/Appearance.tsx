import { Button, Input, Panel } from '@/components/ui'
import { Save } from 'lucide-react'
import { useState } from 'react'
import { apiPost } from '@/lib/api'
import type { AdminContext } from '../types'

export function SystemAppearanceView({ data, perform, acting, reloadBranding }: AdminContext) {
  const branding = data?.branding ?? { product_name: 'NexusFlow', system_name: 'NexusFlow' }
  const [productName, setProductName] = useState(branding.product_name)
  const [systemName, setSystemName] = useState(branding.system_name)

  return (
    <div className="grid grid-cols-[420px_1fr] gap-6">
      <Panel title="系统外观配置">
        <form className="flex flex-col gap-5" onSubmit={(event) => {
          event.preventDefault()
          void perform('发布系统外观配置', async () => {
            const payload = {
              product_name: productName.trim(),
              system_name: systemName.trim(),
              updated_from: 'sa-admin',
            }
            const draft = await apiPost<{ id: string }>('/config/branding/draft', payload)
            await apiPost('/config/branding/publish', { id: draft.id, reason: 'SA 发布系统外观配置' })
            await reloadBranding()
          })
        }}>
          <Input label="左侧栏产品名称" maxLength={40} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="例如 NexusFlow" required />
          <Input label="系统全局名称" maxLength={60} value={systemName} onChange={(event) => setSystemName(event.target.value)} placeholder="用于浏览器 tab、登录页和邀请注册页" required />
          <Button disabled={!productName.trim() || !systemName.trim() || acting === '发布系统外观配置'}>
            <Save className="h-4 w-4" />保存并发布
          </Button>
        </form>
      </Panel>
      <Panel title="展示预览">
        <div className="grid grid-cols-2 gap-4">
          <PreviewCard label="左侧栏顶部" value={productName.trim() || 'NexusFlow'} />
          <PreviewCard label="浏览器 tab / 登录页" value={systemName.trim() || productName.trim() || 'NexusFlow'} />
        </div>
        <p className="text-sm text-text-muted">发布后新打开页面会读取最新配置；当前页面会在保存完成后同步刷新显示。</p>
      </Panel>
    </div>
  )
}

function PreviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-bg-tertiary p-4">
      <span className="text-xs font-medium uppercase text-text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-sm font-bold text-primary-text">
          {value.charAt(0)}
        </span>
        <span className="min-w-0 truncate text-lg font-bold text-text-primary">{value}</span>
      </div>
    </div>
  )
}
