import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiNotification, formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

function notificationTypeLabel(type?: string) {
  const map: Record<string, string> = {
    task: '任务',
    approval: '审批',
    conflict: '冲突',
    resource: '资料',
    system: '系统',
  }
  return map[type ?? ''] ?? type ?? '通知'
}

function notificationTitle(item: ApiNotification) {
  return item.title || String(item.payload?.title ?? item.notification_type ?? '系统通知')
}

function notificationContent(item: ApiNotification) {
  return item.content || String(item.payload?.content ?? item.payload?.message ?? '')
}

function normalizeActionUrl(url?: string | null) {
  if (!url) return '/tasks'
  return url.startsWith('/') ? url : '/tasks'
}

function loadNotifications() {
  return apiGet<ApiList<ApiNotification>>('/notifications', { page_size: 100 })
}

export function NotificationCenterPage() {
  const [message, setMessage] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(loadNotifications)
  const notifications = data?.items ?? []
  const unreadCount = notifications.filter((item) => !item.read_at).length

  async function markRead(id: string) {
    setMessage(null)
    try {
      await apiPost(`/notifications/${id}/read`)
      await reload()
      setMessage('通知已标记为已读')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '标记已读失败')
    }
  }

  return (
    <MainLayout title="通知" subtitle={`未读 ${unreadCount} 条`}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        {(error || message) && (
          <div className={error ? 'rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error' : 'rounded-md bg-color-success-bg px-4 py-3 text-sm text-color-success'}>
            {error || message}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border-subtle bg-bg-secondary">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="text-sm font-semibold text-text-primary">通知列表</div>
            <div className="text-xs text-text-muted">{loading ? '加载中...' : `共 ${notifications.length} 条`}</div>
          </div>
          <div className="h-full overflow-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th className="w-[420px]">通知内容</Th>
                  <Th className="w-[120px]">类型</Th>
                  <Th className="w-[120px]">状态</Th>
                  <Th className="w-[180px]">时间</Th>
                  <Th className="w-[180px]">操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {notifications.map((item) => (
                  <Tr key={item.id}>
                    <Td className="w-[420px]">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-text-primary">{notificationTitle(item)}</span>
                        <span className="text-sm text-text-muted">{notificationContent(item) || '无附加内容'}</span>
                      </div>
                    </Td>
                    <Td className="w-[120px]"><Badge>{notificationTypeLabel(item.notification_type)}</Badge></Td>
                    <Td className="w-[120px]">{item.read_at ? '已读' : '未读'}</Td>
                    <Td className="w-[180px]">{formatDateTime(item.created_at)}</Td>
                    <Td className="w-[180px]">
                      <div className="flex items-center gap-2">
                        {item.action_url && (
                          <Link to={normalizeActionUrl(item.action_url)}>
                            <Button variant="secondary" className="h-9 px-3 py-0 text-sm">
                              <ExternalLink className="h-4 w-4" />
                              打开
                            </Button>
                          </Link>
                        )}
                        {!item.read_at && (
                          <Button className="h-9 px-3 py-0 text-sm" onClick={() => void markRead(item.id)}>
                            <Check className="h-4 w-4" />
                            已读
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {!loading && notifications.length === 0 && <EmptyState title="暂无通知" desc="当前账号没有系统通知。" />}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
