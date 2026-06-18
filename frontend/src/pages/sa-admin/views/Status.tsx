import { Panel } from '@/components/ui'
import type { AdminContext } from '../types'
import { InfoRow, RuntimePanel } from '../components'

export function StatusView({ data }: AdminContext) {
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <RuntimePanel runtime={data?.runtime} />
      <Panel title="运行细节">
        <InfoRow label="状态" value={data?.runtime.status ?? '未知'} />
        <InfoRow label="数据库" value={data?.runtime.database ? '正常' : '未就绪'} />
        <InfoRow label="Redis" value={data?.runtime.redis ? '正常' : '未就绪'} />
        <InfoRow label="对象存储" value={data?.runtime.s3_configured ? '已配置' : '未配置'} />
        <InfoRow label="搜索后端" value={data?.runtime.search_backend ?? 'unknown'} />
        <InfoRow label="运行时长" value={`${data?.runtime.uptime_seconds ?? 0}s`} />
      </Panel>
    </div>
  )
}
