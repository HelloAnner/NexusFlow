import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, Table, Tabs, Tag, Tbody, Td, Th, Thead, TimelineItem, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiResource, formatDateTime, numberValue, resourceStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Archive, Download, FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface ResourceVersion {
  id: string
  resource_id: string
  version_no?: number
  object_key?: string
  file_size?: number
  content_type?: string
  sha256?: string | null
  uploaded_at?: string
}

interface ResourceLink {
  object_type?: string
  object_id?: string
  object_name?: string
  object_no?: string
  target_url?: string
}

interface DomainEvent {
  id: string
  event_type?: string
  actor_id?: string | null
  created_at?: string
}

interface AuditLog {
  id: string
  action?: string
  actor_id?: string | null
  created_at?: string
  reason?: string
}

interface ResourceDetailResponse {
  resource: ApiResource
  versions: ResourceVersion[]
  links: ResourceLink[]
  events: DomainEvent[]
  audits: AuditLog[]
}

const tabs = [
  { value: 'preview', label: '预览' },
  { value: 'versions', label: '版本历史' },
  { value: 'links', label: '关联任务' },
  { value: 'scope', label: '权限范围' },
  { value: 'logs', label: '操作日志' },
]

function statusVariant(status?: string) {
  if (status === 'confirmed' || status === 'archived') return 'success'
  if (status === 'rejected') return 'error'
  return 'info'
}

function formatSize(value: unknown) {
  const bytes = numberValue(value)
  if (!bytes) return '未知'
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

function objectTypeLabel(type?: string) {
  if (type === 'task') return '任务'
  if (type === 'project') return '项目'
  return type || '对象'
}

export function ResourceDetailPage() {
  const { id = '' } = useParams()
  const [activeTab, setActiveTab] = useState('preview')
  const [message, setMessage] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const detailState = useApiData(() => apiGet<ResourceDetailResponse>(`/resources/${id}`), [id])
  const detail = detailState.data
  const resource = detail?.resource
  const currentVersion = detail?.versions?.[0]

  async function downloadResource() {
    setActing('download')
    setMessage(null)
    try {
      const res = await apiGet<{ download_url: string }>(`/resources/${id}/download-url`)
      window.open(res.download_url, '_blank', 'noopener,noreferrer')
      await detailState.reload()
      setMessage('已生成下载地址，并写入下载审计。')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '获取下载地址失败')
    } finally {
      setActing(null)
    }
  }

  async function archiveResource() {
    setActing('archive')
    setMessage(null)
    try {
      await apiPost(`/resources/${id}/archive`, {})
      await detailState.reload()
      setMessage('资料已归档')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '资料归档失败')
    } finally {
      setActing(null)
    }
  }

  async function uploadVersion(file: File) {
    setActing('version')
    setMessage(null)
    try {
      const upload = await apiPost<{ resource_id: string; version_id: string; object_key: string; s3_configured?: boolean }>('/resources/upload-url', {
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
      await apiPost(`/resources/${id}/versions`, {
        object_key: upload.object_key,
        filename: file.name,
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
        change_note: '资料详情页上传新版本',
      })
      await detailState.reload()
      setMessage(upload.s3_configured ? '新版本已登记。' : '对象存储未配置，已登记新版本元数据。')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '上传新版本失败')
    } finally {
      setActing(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <MainLayout title="资料详情" subtitle={resource ? `${resource.name} · v${currentVersion?.version_no ?? resource.version_no ?? 1}` : '资料工作台'}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        {(detailState.error || message) && (
          <div className={`rounded-md px-4 py-3 text-sm ${detailState.error ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
            {detailState.error ?? message}
          </div>
        )}

        {resource && (
          <div className="rounded-md border border-border-subtle bg-bg-secondary p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-text-primary">{resource.name}</h1>
                  <Tag variant={statusVariant(resource.status)}>{resourceStatusLabel(resource.status)}</Tag>
                  <Badge>{resource.resource_type ?? 'file'}</Badge>
                  {resource.is_stage_result && <Badge>阶段成果</Badge>}
                  {resource.is_final_result && <Badge>最终成果</Badge>}
                </div>
                <p className="mt-2 text-sm text-text-muted">{currentVersion?.object_key ?? resource.object_key ?? resource.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadVersion(file)
                  }}
                />
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={acting === 'version'} onClick={() => fileRef.current?.click()}>
                  <FileUp className="h-4 w-4" />新版本
                </Button>
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={acting === 'download'} onClick={() => void downloadResource()}>
                  <Download className="h-4 w-4" />下载
                </Button>
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={acting === 'archive' || resource.status === 'archived'} onClick={() => void archiveResource()}>
                  <Archive className="h-4 w-4" />归档
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Info label="最新版本" value={`v${currentVersion?.version_no ?? resource.version_no ?? 1}`} />
              <Info label="文件大小" value={formatSize(currentVersion?.file_size ?? resource.file_size ?? resource.size_bytes)} />
              <Info label="内容类型" value={currentVersion?.content_type ?? '未知'} />
              <Info label="更新时间" value={formatDateTime(resource.updated_at)} />
              <Info label="上传时间" value={formatDateTime(currentVersion?.uploaded_at ?? resource.created_at)} />
            </div>
          </div>
        )}

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="rounded-md border border-border-subtle bg-bg-secondary p-2" />

        {detailState.loading && <Panel><EmptyState title="正在加载资料详情" /></Panel>}
        {!detailState.loading && detail && (
          <>
            {activeTab === 'preview' && (
              <Panel title="资料预览">
                <div className="rounded-md border border-dashed border-border-subtle bg-bg-tertiary p-8 text-center">
                  <div className="text-lg font-semibold text-text-primary">{resource?.name}</div>
                  <p className="mt-2 text-sm text-text-muted">当前版本对象：{currentVersion?.object_key ?? '未记录对象 key'}</p>
                  <Button className="mt-4 h-9 px-3 py-0 text-sm" onClick={() => void downloadResource()}>
                    <Download className="h-4 w-4" />下载查看
                  </Button>
                </div>
              </Panel>
            )}
            {activeTab === 'versions' && (
              <Panel title="版本历史">
                <Table>
                  <Thead><Tr><Th>版本</Th><Th>对象 Key</Th><Th>大小</Th><Th>类型</Th><Th>上传时间</Th></Tr></Thead>
                  <Tbody>
                    {detail.versions.map((version) => (
                      <Tr key={version.id}>
                        <Td>v{version.version_no}</Td>
                        <Td>{version.object_key}</Td>
                        <Td>{formatSize(version.file_size)}</Td>
                        <Td>{version.content_type}</Td>
                        <Td>{formatDateTime(version.uploaded_at)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {detail.versions.length === 0 && <EmptyState title="暂无版本记录" />}
              </Panel>
            )}
            {activeTab === 'links' && (
              <Panel title="关联对象">
                <Table>
                  <Thead><Tr><Th>类型</Th><Th>名称</Th><Th>编号</Th><Th>入口</Th></Tr></Thead>
                  <Tbody>
                    {detail.links.map((link) => (
                      <Tr key={`${link.object_type}-${link.object_id}`}>
                        <Td>{objectTypeLabel(link.object_type)}</Td>
                        <Td>{link.object_name ?? link.object_id}</Td>
                        <Td>{link.object_no ?? '未编号'}</Td>
                        <Td>{link.target_url ? <Link className="text-text-primary hover:underline" to={link.target_url}>打开</Link> : '无入口'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {detail.links.length === 0 && <EmptyState title="暂无关联对象" />}
              </Panel>
            )}
            {activeTab === 'scope' && (
              <Panel title="权限范围">
                <div className="grid gap-3 md:grid-cols-4">
                  <Info label="可见性" value={resource?.visibility ?? 'normal'} />
                  <Info label="上传人" value={resource?.uploader_id ?? '未记录'} />
                  <Info label="阶段成果" value={resource?.is_stage_result ? '是' : '否'} />
                  <Info label="最终成果" value={resource?.is_final_result ? '是' : '否'} />
                </div>
              </Panel>
            )}
            {activeTab === 'logs' && (
              <Panel title="操作日志">
                {detail.events.map((event) => (
                  <TimelineItem key={event.id} title={event.event_type ?? '资料事件'} desc={event.actor_id ? `操作人：${event.actor_id}` : undefined} time={formatDateTime(event.created_at)} />
                ))}
                {detail.audits.map((audit) => (
                  <TimelineItem key={audit.id} title={audit.action ?? '审计记录'} desc={audit.reason ? `原因：${audit.reason}` : undefined} time={formatDateTime(audit.created_at)} />
                ))}
                {detail.events.length + detail.audits.length === 0 && <EmptyState title="暂无操作日志" />}
              </Panel>
            )}
          </>
        )}
      </div>
    </MainLayout>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}
