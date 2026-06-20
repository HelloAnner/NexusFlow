import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, Table, Tabs, Tag, Tbody, Td, Th, Thead, TimelineItem, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiResource, formatDateTime, numberValue, resourceStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { AlertTriangle, Archive, Download, FileImage, FileQuestion, FileText, FileUp, Lock, ShieldCheck } from 'lucide-react'
import { type ReactNode, useMemo, useRef, useState } from 'react'
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
  payload?: Record<string, unknown>
  created_at?: string
}

interface AuditLog {
  id: string
  action?: string
  actor_id?: string | null
  created_at?: string
  reason?: string
  after_payload?: Record<string, unknown>
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

function previewStrategy(resource?: ApiResource, version?: ResourceVersion) {
  const contentType = version?.content_type ?? ''
  const name = resource?.name?.toLowerCase() ?? ''
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) {
    return {
      kind: 'image',
      title: '图片可预览',
      desc: '生成下载地址后可在当前页面展示图片预览。',
    }
  }
  if (contentType.includes('pdf') || name.endsWith('.pdf')) {
    return {
      kind: 'pdf',
      title: 'PDF 暂不内嵌预览',
      desc: '可下载查看；预览服务接入后在此展示 sandbox iframe。',
    }
  }
  if (/\.(docx?|xlsx?|pptx?)$/.test(name) || /officedocument|msword|spreadsheet|presentation/.test(contentType)) {
    return {
      kind: 'office',
      title: 'Office 预览服务未接入',
      desc: '当前仅提供下载查看，后续接入在线预览时必须使用受限 iframe。',
    }
  }
  return {
    kind: 'unknown',
    title: '该类型暂不支持内嵌预览',
    desc: '不会展示空白预览区，可通过下载查看原文件。',
  }
}

function latestTime(detail?: ResourceDetailResponse) {
  const times = [
    detail?.resource?.updated_at,
    detail?.versions?.[0]?.uploaded_at,
    ...(detail?.events ?? []).map((item) => item.created_at),
    ...(detail?.audits ?? []).map((item) => item.created_at),
  ].filter(Boolean) as string[]
  return times.sort().at(-1)
}

export function ResourceDetailPage() {
  const { id = '' } = useParams()
  const [activeTab, setActiveTab] = useState('preview')
  const [message, setMessage] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const detailState = useApiData(() => apiGet<ResourceDetailResponse>(`/resources/${id}`), [id])
  const detail = detailState.data
  const resource = detail?.resource
  const currentVersion = detail?.versions?.[0]
  const taskLinks = useMemo(() => detail?.links.filter((link) => link.object_type === 'task') ?? [], [detail?.links])
  const projectLinks = useMemo(() => detail?.links.filter((link) => link.object_type === 'project') ?? [], [detail?.links])
  const strategy = previewStrategy(resource, currentVersion)
  const isArchived = resource?.status === 'archived'
  const lastActivityAt = latestTime(detail ?? undefined)

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

  async function generatePreview() {
    setActing('preview')
    setMessage(null)
    try {
      const res = await apiGet<{ download_url: string }>(`/resources/${id}/download-url`)
      setPreviewUrl(res.download_url)
      setMessage(strategy.kind === 'image' ? '已生成图片预览地址，并写入下载审计。' : '已生成下载地址，并写入下载审计。')
      if (strategy.kind !== 'image') {
        window.open(res.download_url, '_blank', 'noopener,noreferrer')
      }
      await detailState.reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '生成预览地址失败')
    } finally {
      setActing(null)
    }
  }

  async function archiveResource() {
    const impact = `${taskLinks.length} 个任务、${projectLinks.length} 个项目`
    if (!window.confirm(`确认归档该资料？归档会影响 ${impact} 的资料验收和后续版本维护。`)) return
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
      setActiveTab('versions')
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
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={acting === 'version' || isArchived} onClick={() => fileRef.current?.click()}>
                  <FileUp className="h-4 w-4" />新版本
                </Button>
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm" disabled={acting === 'download'} onClick={() => void downloadResource()}>
                  <Download className="h-4 w-4" />下载
                </Button>
                <Button variant="secondary" className="h-9 px-3 py-0 text-sm text-color-error" disabled={acting === 'archive' || isArchived} onClick={() => void archiveResource()}>
                  <Archive className="h-4 w-4" />归档
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
              <Info label="成果状态" value={resourceStatusLabel(resource.status)} />
              <Info label="当前版本" value={`v${currentVersion?.version_no ?? resource.version_no ?? 1}`} />
              <Info label="关联项目" value={`${projectLinks.length}`} />
              <Info label="关联任务" value={`${taskLinks.length}`} />
              <Info label="最近活动" value={formatDateTime(lastActivityAt)} />
              <Info label="预览策略" value={strategy.title} />
            </div>
          </div>
        )}

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="rounded-md border border-border-subtle bg-bg-secondary p-2" />

        {detailState.loading && <Panel><EmptyState title="正在加载资料详情" /></Panel>}
        {!detailState.loading && detail && (
          <>
            {activeTab === 'preview' && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.95fr)]">
                <Panel title="资料预览">
                  <ResourcePreview
                    resource={resource}
                    currentVersion={currentVersion}
                    strategy={strategy}
                    previewUrl={previewUrl}
                    acting={acting}
                    onPreview={() => void generatePreview()}
                  />
                </Panel>
                <Panel title="成果与验收">
                  <div className="space-y-3">
                    <ImpactCard
                      icon={<ShieldCheck className="h-4 w-4 text-color-info" />}
                      title={resource?.is_final_result ? '最终成果' : resource?.is_stage_result ? '阶段成果' : '普通资料'}
                      tag={resource?.is_final_result || resource?.is_stage_result ? '参与验收' : '不参与验收'}
                      desc={resource?.is_final_result || resource?.is_stage_result ? '关联任务提交验收时会计入必需资料匹配。' : '该资料未标记为成果文件，仅作为关联资料展示。'}
                    />
                    <ImpactCard
                      icon={<AlertTriangle className="h-4 w-4 text-color-warning" />}
                      title="关联影响"
                      tag={`${taskLinks.length} 个任务`}
                      desc={taskLinks.length ? '归档前需要确认不会阻断后续验收或版本维护。' : '当前没有关联任务，归档影响主要限于资料库状态。'}
                    />
                    <ImpactCard
                      icon={<Lock className="h-4 w-4 text-text-muted" />}
                      title="归档锁定"
                      tag={isArchived ? '已锁定' : '未锁定'}
                      desc={isArchived ? '资料已归档，普通用户不可再上传新版本。' : '归档后普通用户不可再上传新版本。'}
                    />
                    <div className="rounded-md bg-color-warning-bg px-3 py-2 text-sm text-color-warning">
                      点击归档会弹出二次确认，成功后刷新状态并在操作日志中显示 resource.archived。
                    </div>
                  </div>
                </Panel>
              </div>
            )}
            {activeTab === 'versions' && (
              <Panel title="版本历史" right={<span className="text-xs text-text-muted">{detail.versions.length} 个版本</span>}>
                <Table>
                  <Thead><Tr><Th>版本</Th><Th>对象 Key</Th><Th>大小</Th><Th>类型</Th><Th>上传时间</Th></Tr></Thead>
                  <Tbody>
                    {detail.versions.map((version) => {
                      const current = version.id === resource?.current_version_id || version.id === currentVersion?.id
                      return (
                        <Tr key={version.id} className={current ? 'bg-bg-tertiary' : undefined}>
                          <Td>
                            <div className="flex items-center gap-2">
                              <span>v{version.version_no}</span>
                              {current && <Tag variant="success">当前</Tag>}
                            </div>
                          </Td>
                          <Td>{version.object_key}</Td>
                          <Td>{formatSize(version.file_size)}</Td>
                          <Td>{version.content_type}</Td>
                          <Td>{formatDateTime(version.uploaded_at)}</Td>
                        </Tr>
                      )
                    })}
                  </Tbody>
                </Table>
                {detail.versions.length === 0 && <EmptyState title="暂无版本记录" />}
              </Panel>
            )}
            {activeTab === 'links' && (
              <Panel
                title="关联对象"
                right={<span className="text-xs text-text-muted">{projectLinks.length} 个项目 / {taskLinks.length} 个任务</span>}
              >
                {taskLinks.length > 0 && (
                  <div className="mb-3 rounded-md bg-color-info-bg px-4 py-3 text-sm text-color-info">
                    关联到任务的资料会参与任务资料完整率和验收资料规则匹配。
                  </div>
                )}
                <Table>
                  <Thead><Tr><Th>类型</Th><Th>名称</Th><Th>编号</Th><Th>验收影响</Th><Th>入口</Th></Tr></Thead>
                  <Tbody>
                    {detail.links.map((link) => (
                      <Tr key={`${link.object_type}-${link.object_id}`}>
                        <Td><Badge>{objectTypeLabel(link.object_type)}</Badge></Td>
                        <Td>{link.object_name ?? link.object_id}</Td>
                        <Td>{link.object_no ?? '未编号'}</Td>
                        <Td>{link.object_type === 'task' ? '参与任务资料完整率' : link.object_type === 'project' ? '项目资料空间可见' : '无直接验收规则'}</Td>
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
                <div className="grid gap-3 md:grid-cols-5">
                  <Info label="可见性" value={resource?.visibility ?? 'normal'} />
                  <Info label="上传人" value={resource?.uploader_name ?? resource?.uploader_id ?? '未记录'} />
                  <Info label="阶段成果" value={resource?.is_stage_result ? '是' : '否'} />
                  <Info label="最终成果" value={resource?.is_final_result ? '是' : '否'} />
                  <Info label="归档锁定" value={isArchived ? '已锁定' : '未锁定'} />
                </div>
                {isArchived ? (
                  <div className="mt-4 rounded-md bg-color-warning-bg px-4 py-3 text-sm text-color-warning">
                    资料已归档。普通用户不可再登记新版本，下载和审计仍按权限执行。
                  </div>
                ) : (
                  <div className="mt-4 rounded-md bg-bg-tertiary px-4 py-3 text-sm text-text-muted">
                    文件可见性仍以服务端数据范围和隐藏授权为准，前端只展示当前可访问结果。
                  </div>
                )}
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

function ResourcePreview({
  resource,
  currentVersion,
  strategy,
  previewUrl,
  acting,
  onPreview,
}: {
  resource?: ApiResource
  currentVersion?: ResourceVersion
  strategy: ReturnType<typeof previewStrategy>
  previewUrl: string | null
  acting: string | null
  onPreview: () => void
}) {
  const canShowImage = strategy.kind === 'image' && previewUrl
  const Icon = strategy.kind === 'image' ? FileImage : strategy.kind === 'unknown' ? FileQuestion : FileText

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-dashed border-border-subtle bg-bg-tertiary p-8 text-center">
        {canShowImage ? (
          <img className="mx-auto max-h-[360px] max-w-full rounded-md border border-border-subtle bg-bg-secondary object-contain" src={previewUrl} alt={resource?.name ?? '资料预览'} />
        ) : (
          <>
            <Icon className="mx-auto h-12 w-12 text-text-muted" />
            <div className="mt-4 text-lg font-semibold text-text-primary">{strategy.title}</div>
            <p className="mx-auto mt-2 max-w-xl text-sm text-text-muted">{strategy.desc}</p>
            <p className="mt-3 break-all text-xs text-text-muted">当前版本对象：{currentVersion?.object_key ?? resource?.object_key ?? '未记录对象 key'}</p>
            <Button className="mt-4 h-9 px-3 py-0 text-sm" disabled={acting === 'preview'} onClick={onPreview}>
              <Download className="h-4 w-4" />{strategy.kind === 'image' ? '生成预览' : '下载查看'}
            </Button>
          </>
        )}
      </div>
      <div className="rounded-md bg-color-info-bg px-4 py-3 text-sm text-color-info">
        所有下载和预览地址生成都会写入审计日志；不支持内嵌预览时不会展示空白区域。
      </div>
    </div>
  )
}

function ImpactCard({ icon, title, tag, desc }: { icon: ReactNode; title: string; tag: string; desc: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          {icon}
          {title}
        </div>
        <Tag variant="info">{tag}</Tag>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{desc}</p>
    </div>
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
