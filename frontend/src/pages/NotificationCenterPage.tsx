import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiNotification, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApiData } from '@/lib/useApiData'
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Home,
  Mail,
  MessageSquare,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type FilterKey = 'all' | 'unread' | 'read' | 'restricted'

interface NotificationPrefs {
  inApp: boolean
  email: boolean
  sms: boolean
  showOnHome: boolean
  events: string[]
}

const PREF_KEY = 'nexusflow.notification.preferences'
const eventOptions = [
  { value: 'task', label: '任务状态' },
  { value: 'approval', label: '审批协调' },
  { value: 'conflict', label: '风险冲突' },
  { value: 'resource', label: '资料更新' },
]

const defaultPrefs: NotificationPrefs = {
  inApp: true,
  email: false,
  sms: false,
  showOnHome: true,
  events: ['task', 'approval', 'conflict', 'resource'],
}

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
  if (!url) return null
  return url.startsWith('/') ? url : '/tasks'
}

function isRestricted(item: ApiNotification) {
  return item.payload?.redacted === true || !normalizeActionUrl(item.action_url)
}

function priorityVariant(priority?: string) {
  if (priority === 'high' || priority === 'critical') return 'error'
  if (priority === 'medium') return 'warning'
  if (priority === 'low') return 'success'
  return 'info'
}

function priorityLabel(priority?: string) {
  const map: Record<string, string> = {
    critical: '高风险',
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  }
  return map[priority ?? ''] ?? '普通'
}

function restrictionReason(item: ApiNotification) {
  if (item.payload?.reason === 'out_of_data_scope') return '关联对象不在当前账号的数据范围内'
  if (!normalizeActionUrl(item.action_url)) return '该通知没有可打开的业务入口'
  return '无权限限制'
}

function payloadSummary(item: ApiNotification) {
  const payload = item.payload ?? {}
  const text = JSON.stringify(payload, null, 2)
  if (text.length <= 520) return text
  return `${text.slice(0, 520)}\n...`
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return defaultPrefs
    return { ...defaultPrefs, ...JSON.parse(raw) } as NotificationPrefs
  } catch {
    localStorage.removeItem(PREF_KEY)
    return defaultPrefs
  }
}

function loadNotifications() {
  return apiGet<ApiList<ApiNotification>>('/notifications', { page_size: 100 })
}

export function NotificationCenterPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs)
  const { data, loading, error, reload } = useApiData(loadNotifications)
  const notifications = useMemo(() => data?.items ?? [], [data?.items])
  const unreadCount = notifications.filter((item) => !item.read_at).length
  const restrictedCount = notifications.filter(isRestricted).length
  const readCount = notifications.length - unreadCount

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'unread') return notifications.filter((item) => !item.read_at)
    if (activeFilter === 'read') return notifications.filter((item) => Boolean(item.read_at))
    if (activeFilter === 'restricted') return notifications.filter(isRestricted)
    return notifications
  }, [activeFilter, notifications])

  const activeNotification = useMemo(() => {
    return filteredNotifications.find((item) => item.id === activeId) ?? filteredNotifications[0] ?? null
  }, [activeId, filteredNotifications])
  const selectedNotifications = useMemo(
    () => filteredNotifications.filter((item) => selectedIds.includes(item.id)),
    [filteredNotifications, selectedIds]
  )
  const selectedUnread = selectedNotifications.filter((item) => !item.read_at)
  const allVisibleSelected = filteredNotifications.length > 0 && filteredNotifications.every((item) => selectedIds.includes(item.id))

  function applyFilter(filter: FilterKey) {
    setActiveFilter(filter)
    setSelectedIds([])
    setMessage(null)
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.concat(id))
  }

  function toggleAllVisible() {
    const visibleIds = filteredNotifications.map((item) => item.id)
    setSelectedIds((current) => {
      if (visibleIds.length > 0 && visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id))
      }
      return Array.from(new Set(current.concat(visibleIds)))
    })
  }

  async function markRead(id: string, options?: { quiet?: boolean }) {
    setMessage(null)
    setActing(id)
    try {
      await apiPost(`/notifications/${id}/read`)
      await reload()
      setSelectedIds((current) => current.filter((item) => item !== id))
      if (!options?.quiet) setMessage({ type: 'success', text: '通知已标记为已读' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '标记已读失败' })
      throw err
    } finally {
      setActing(null)
    }
  }

  async function markSelectedRead() {
    if (selectedUnread.length === 0) {
      setMessage({ type: 'info', text: '当前选择中没有未读通知' })
      return
    }
    setActing('bulk-read')
    setMessage(null)
    const failures: string[] = []
    for (const item of selectedUnread) {
      try {
        await apiPost(`/notifications/${item.id}/read`)
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `${notificationTitle(item)} 处理失败`)
      }
    }
    setActing(null)
    if (failures.length > 0) {
      setMessage({ type: 'error', text: `${failures.length} 条通知标记失败：${failures[0]}` })
      return
    }
    await reload()
    setSelectedIds((current) => current.filter((id) => !selectedUnread.some((item) => item.id === id)))
    setMessage({ type: 'success', text: `${selectedUnread.length} 条通知已标记为已读` })
  }

  function updatePrefs(next: NotificationPrefs) {
    setPrefs(next)
    localStorage.setItem(PREF_KEY, JSON.stringify(next))
    setMessage({ type: 'success', text: '本机通知偏好已保存' })
  }

  function togglePref(key: keyof Omit<NotificationPrefs, 'events'>) {
    updatePrefs({ ...prefs, [key]: !prefs[key] })
  }

  function toggleEvent(value: string) {
    const events = prefs.events.includes(value) ? prefs.events.filter((item) => item !== value) : prefs.events.concat(value)
    updatePrefs({ ...prefs, events })
  }

  return (
    <MainLayout title="Inbox" subtitle={`未读 ${unreadCount} 条，权限受限 ${restrictedCount} 条`}>
      <div className="flex h-full min-h-0 flex-col gap-5">
        {(error || message) && (
          <div
            className={cn(
              'rounded-md px-4 py-3 text-sm',
              error || message?.type === 'error'
                ? 'bg-color-error-bg text-color-error'
                : message?.type === 'info'
                  ? 'bg-color-info-bg text-color-info'
                  : 'bg-color-success-bg text-color-success'
            )}
          >
            {error || message?.text}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <MetricButton active={activeFilter === 'all'} label="全部通知" value={notifications.length} sub="点击清除筛选" onClick={() => applyFilter('all')} />
          <MetricButton active={activeFilter === 'unread'} label="未读" value={unreadCount} sub="待处理" onClick={() => applyFilter('unread')} />
          <MetricButton active={activeFilter === 'restricted'} label="权限受限" value={restrictedCount} sub="已脱敏或无入口" onClick={() => applyFilter('restricted')} />
          <MetricButton active={activeFilter === 'read'} label="已读" value={readCount} sub="最近通知" onClick={() => applyFilter('read')} />
        </div>

        <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="min-h-0 overflow-hidden" title="通知处理队列" right={<HeaderActions onSettings={() => setSettingsOpen(true)} onMarkAll={() => void markSelectedRead()} disabled={selectedUnread.length === 0 || acting === 'bulk-read'} />}>
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2">
                {(['all', 'unread', 'read', 'restricted'] as FilterKey[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={cn(
                      'h-8 rounded-md px-3 text-sm transition-fast',
                      activeFilter === filter ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg hover:text-text-primary'
                    )}
                    onClick={() => applyFilter(filter)}
                  >
                    {filterLabel(filter)}
                  </button>
                ))}
              </div>
              <div className="text-xs text-text-muted">{loading ? '加载中...' : `当前 ${filteredNotifications.length} 条`}</div>
            </div>

            {selectedNotifications.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-text-primary bg-bg-tertiary px-4 py-3">
                <label className="flex items-center gap-3 text-sm text-text-primary">
                  <input type="checkbox" className="h-4 w-4 accent-black" checked onChange={() => setSelectedIds([])} />
                  <span className="font-semibold">已选 {selectedNotifications.length} 条</span>
                  <span className="text-text-muted">未读 {selectedUnread.length} 条</span>
                </label>
                <div className="flex items-center gap-2">
                  <Button className="h-8 px-3 text-sm" disabled={selectedUnread.length === 0 || acting === 'bulk-read'} onClick={() => void markSelectedRead()}>
                    <CheckCheck className="h-4 w-4" />
                    {acting === 'bulk-read' ? '处理中...' : '批量已读'}
                  </Button>
                  <Button variant="ghost" className="h-8 px-3 text-sm" onClick={() => setSelectedIds([])}>
                    清空选择
                  </Button>
                </div>
              </div>
            )}

            {filteredNotifications.length > 0 && (
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <input type="checkbox" className="h-4 w-4 accent-black" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  选择当前筛选下 {filteredNotifications.length} 条
                </label>
                <span className="text-xs text-text-muted">批量失败时会保留当前选择。</span>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {filteredNotifications.map((item) => {
                const selected = selectedIds.includes(item.id)
                const active = activeNotification?.id === item.id
                const restricted = isRestricted(item)
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 border-b border-border-subtle bg-bg-secondary px-4 py-4 text-left transition-fast',
                      !item.read_at && 'border-l-4 border-l-color-info',
                      selected && 'bg-bg-tertiary',
                      active && 'ring-2 ring-inset ring-primary-fill',
                      !active && 'hover:bg-hover-bg'
                    )}
                    onClick={() => setActiveId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setActiveId(item.id)
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-black"
                      checked={selected}
                      aria-label={`选择通知 ${notificationTitle(item)}`}
                      onChange={() => toggleSelected(item.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <NotificationIcon item={item} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={cn('truncate text-sm text-text-primary', !item.read_at ? 'font-bold' : 'font-medium')}>
                          {notificationTitle(item)}
                        </h3>
                        {restricted && <Tag variant="error">权限受限</Tag>}
                        <Tag variant={priorityVariant(item.priority)}>{priorityLabel(item.priority)}</Tag>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-muted">{notificationContent(item) || '无附加内容'}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <Badge>{notificationTypeLabel(item.notification_type)}</Badge>
                        <span>{item.read_at ? '已读' : '未读'}</span>
                        <span>{formatDateTime(item.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {normalizeActionUrl(item.action_url) && (
                        <Link to={normalizeActionUrl(item.action_url) ?? '/tasks'} onClick={(event) => event.stopPropagation()}>
                          <Button variant="secondary" className="h-8 px-2 text-xs">
                            <ExternalLink className="h-4 w-4" />
                            打开
                          </Button>
                        </Link>
                      )}
                      {!item.read_at && (
                        <Button
                          className="h-8 px-2 text-xs"
                          disabled={acting === item.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            void markRead(item.id)
                          }}
                        >
                          <Check className="h-4 w-4" />
                          已读
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
              {!loading && filteredNotifications.length === 0 && <EmptyState title="暂无通知" desc="当前筛选下没有通知。" />}
            </div>
          </Panel>

          <NotificationPreview
            item={activeNotification}
            acting={acting}
            onRead={(id) => void markRead(id)}
            onSettings={() => setSettingsOpen(true)}
          />
        </div>

        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-[560px] rounded-lg border border-border-subtle bg-bg-primary p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">通知偏好</h3>
                  <p className="mt-1 text-sm text-text-muted">当前先保存为本机偏好预设，后端通知偏好模型待接入。</p>
                </div>
                <Button variant="ghost" className="h-8 w-8 px-0" onClick={() => setSettingsOpen(false)} aria-label="关闭设置">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PrefToggle label="站内" icon={<Bell className="h-4 w-4" />} checked={prefs.inApp} onChange={() => togglePref('inApp')} />
                <PrefToggle label="邮件" icon={<Mail className="h-4 w-4" />} checked={prefs.email} onChange={() => togglePref('email')} />
                <PrefToggle label="短信" icon={<MessageSquare className="h-4 w-4" />} checked={prefs.sms} onChange={() => togglePref('sms')} />
                <PrefToggle label="显示在首页" icon={<Home className="h-4 w-4" />} checked={prefs.showOnHome} onChange={() => togglePref('showOnHome')} />
              </div>
              <div className="mt-5 rounded-md border border-border-subtle bg-bg-secondary p-4">
                <div className="mb-3 text-sm font-semibold text-text-primary">关注事件类型</div>
                <div className="grid grid-cols-2 gap-2">
                  {eventOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 rounded-md bg-bg-tertiary px-3 py-2 text-sm text-text-secondary">
                      <input type="checkbox" className="h-4 w-4 accent-black" checked={prefs.events.includes(option.value)} onChange={() => toggleEvent(option.value)} />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => setSettingsOpen(false)}>完成</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function filterLabel(filter: FilterKey) {
  const labels: Record<FilterKey, string> = {
    all: '全部',
    unread: '未读',
    read: '已读',
    restricted: '权限受限',
  }
  return labels[filter]
}

function MetricButton({ active, label, value, sub, onClick }: { active: boolean; label: string; value: number; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="text-left" onClick={onClick}>
      <div className={cn('flex min-h-[92px] flex-col justify-center gap-1.5 rounded-md border bg-bg-secondary p-4 transition-fast hover:bg-hover-bg', active ? 'border-text-primary' : 'border-border-subtle')}>
        <span className="text-sm font-medium text-text-muted">{label}</span>
        <span className="text-stat font-bold text-text-primary">{value}</span>
        <span className="text-xs text-text-muted">{sub}</span>
      </div>
    </button>
  )
}

function HeaderActions({ disabled, onMarkAll, onSettings }: { disabled: boolean; onMarkAll: () => void; onSettings: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" className="h-8 px-3 text-sm" disabled={disabled} onClick={onMarkAll}>
        <CheckCheck className="h-4 w-4" />
        全部已读
      </Button>
      <Button variant="ghost" className="h-8 px-3 text-sm" onClick={onSettings}>
        <Settings className="h-4 w-4" />
        设置
      </Button>
    </div>
  )
}

function NotificationIcon({ item }: { item: ApiNotification }) {
  const restricted = isRestricted(item)
  return (
    <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-tertiary text-text-muted', restricted && 'bg-color-error-bg text-color-error')}>
      {restricted ? <ShieldAlert className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
    </div>
  )
}

function NotificationPreview({ item, acting, onRead, onSettings }: { item: ApiNotification | null; acting: string | null; onRead: (id: string) => void; onSettings: () => void }) {
  if (!item) {
    return (
      <Panel title="详情预览" className="min-h-0">
        <EmptyState title="选择一条通知" desc="查看上下文、权限状态和处理动作。" />
      </Panel>
    )
  }
  const actionUrl = normalizeActionUrl(item.action_url)
  const restricted = isRestricted(item)
  return (
    <Panel
      title="详情预览"
      className="min-h-0"
      right={<Tag variant={item.read_at ? 'success' : 'warning'}>{item.read_at ? '已读' : '未读'}</Tag>}
      footer={(
        <div className="flex justify-end gap-2">
          {!item.read_at && (
            <Button disabled={acting === item.id} onClick={() => onRead(item.id)}>
              <Check className="h-4 w-4" />
              标记已读
            </Button>
          )}
          {actionUrl ? (
            <Link to={actionUrl}>
              <Button variant="secondary">
                <ExternalLink className="h-4 w-4" />
                打开完整详情
              </Button>
            </Link>
          ) : (
            <Button variant="secondary" disabled>
              <ExternalLink className="h-4 w-4" />
              无可打开入口
            </Button>
          )}
        </div>
      )}
    >
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div className="flex items-start gap-3">
          <NotificationIcon item={item} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{notificationTypeLabel(item.notification_type)}</Badge>
              {restricted && <Tag variant="error">权限受限</Tag>}
              <Tag variant={priorityVariant(item.priority)}>{priorityLabel(item.priority)}</Tag>
            </div>
            <h3 className="mt-3 text-xl font-semibold leading-tight text-text-primary">{notificationTitle(item)}</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{notificationContent(item) || '无附加内容'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PreviewInfo label="通知时间" value={formatDateTime(item.created_at)} />
          <PreviewInfo label="入口状态" value={actionUrl ? '可打开' : '不可用'} />
          <PreviewInfo label="阅读状态" value={item.read_at ? formatDateTime(item.read_at) : '未读'} />
          <PreviewInfo label="权限说明" value={restrictionReason(item)} />
        </div>

        {restricted && (
          <div className="rounded-md bg-color-error-bg p-4 text-sm leading-6 text-color-error">
            该通知的关联对象不可见或不可直接打开。系统保留简要记录，但隐藏敏感标题、正文和跳转入口。
          </div>
        )}

        <div className="rounded-md bg-bg-tertiary p-4">
          <div className="mb-2 text-sm font-semibold text-text-primary">Payload 摘要</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-bg-secondary p-3 text-xs leading-5 text-text-secondary">{payloadSummary(item)}</pre>
        </div>

        <div className="rounded-md border border-border-subtle bg-bg-secondary p-4">
          <div className="text-sm font-semibold text-text-primary">处理建议</div>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            简单通知可直接标记已读；涉及审批、冲突或验收的复杂事项，应打开完整详情查看上下文后处理。通知偏好入口用于配置后续展示预设。
          </p>
          <Button variant="ghost" className="mt-3 h-8 px-3 text-sm" onClick={onSettings}>
            <Settings className="h-4 w-4" />
            调整通知偏好
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function PreviewInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-bg-tertiary p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}

function PrefToggle({ label, icon, checked, onChange }: { label: string; icon: React.ReactNode; checked: boolean; onChange: () => void }) {
  return (
    <button type="button" className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-secondary px-3 py-3 text-left" onClick={onChange}>
      <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
        {icon}
        {label}
      </span>
      <span className={cn('flex h-6 w-11 items-center rounded-full p-1 transition-fast', checked ? 'justify-end bg-primary-fill' : 'justify-start bg-bg-tertiary')}>
        <span className="h-4 w-4 rounded-full bg-bg-secondary shadow-sm" />
      </span>
    </button>
  )
}
