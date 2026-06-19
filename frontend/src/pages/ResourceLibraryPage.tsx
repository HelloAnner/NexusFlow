import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiList, type ApiResource, formatDateTime, numberValue, resourceStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

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

export function ResourceLibraryPage() {
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { data, loading, error, reload } = useApiData(() => apiGet<ApiList<ApiResource>>('/resources', { page_size: 100 }))
  const resources = data?.items ?? []

  async function uploadFile(file: File) {
    try {
      const res = await apiPost<{ resource_id: string; version_id: string; object_key: string; upload_url?: string; s3_configured?: boolean }>('/resources/upload-url', {
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
      await apiPost('/resources/complete-upload', {
        resource_id: res.resource_id,
        version_id: res.version_id,
        object_key: res.object_key,
        filename: file.name,
        name: file.name,
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
      })
      setMessage(res.s3_configured ? '资料已登记，请确认对象存储上传结果。' : '对象存储未配置，已先登记资料元数据。')
      await reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '上传资料失败')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function downloadResource(resource: ApiResource) {
    try {
      const res = await apiGet<{ download_url: string }>(`/resources/${resource.id}/download-url`)
      window.open(res.download_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '获取下载地址失败')
    }
  }

  return (
    <MainLayout title="资料库" subtitle="任务资料与归档文件">
      <div className="flex flex-col gap-6">
        {(error || message) && (
          <div className={`rounded-md px-4 py-3 text-sm ${error ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
            {error || message}
          </div>
        )}
        <Panel
          title="资料列表"
          right={
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadFile(file)
                }}
              />
              <Button className="h-9 px-4" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                上传资料
              </Button>
            </div>
          }
          className="min-h-[calc(100vh-180px)]"
        >
          <Table>
            <Thead>
              <Tr><Th>资料名称</Th><Th>类型</Th><Th>状态</Th><Th>大小</Th><Th>创建时间</Th><Th>操作</Th></Tr>
            </Thead>
            <Tbody>
              {resources.map((resource) => (
                <Tr key={resource.id}>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <Link className="text-base font-medium text-text-primary hover:underline" to={`/resources/${resource.id}`}>{resource.name}</Link>
                      <span className="text-xs text-text-muted">{resource.object_key ?? resource.id}</span>
                    </div>
                  </Td>
                  <Td><Badge>{resource.resource_type ?? 'file'}</Badge></Td>
                  <Td><Tag variant={statusVariant(resource.status)}>{resourceStatusLabel(resource.status)}</Tag></Td>
                  <Td>{formatSize(resource.size_bytes)}</Td>
                  <Td>{formatDateTime(resource.created_at)}</Td>
                  <Td>
                    <button className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary" onClick={() => void downloadResource(resource)}>
                      <Download className="h-4 w-4" />
                      下载
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!loading && resources.length === 0 && <EmptyState title="暂无资料" desc="当前可见范围内没有资料文件。" />}
        </Panel>
      </div>
    </MainLayout>
  )
}
