import { AuthLayout } from '@/components/layout'
import { Button, EmptyState, Input, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

interface InvitationTemplate {
  id: string
  name?: string
  invite_type?: string
  default_org_id?: string | null
  default_role_ids?: string[]
  default_project_id?: string | null
  default_project_role?: string | null
  default_work_desc?: string
  need_approval?: boolean
  required_fields?: unknown[]
  payload?: Record<string, unknown>
}

interface InvitationTokenInfo {
  id: string
  expires_at?: string
  remaining_uses?: number
  template: InvitationTemplate
}

interface RegisterResult {
  registration_id: string
  account_id: string
  person_id: string
  status: 'pending' | 'approved'
}

function loadInvitation(token: string) {
  return apiGet<InvitationTokenInfo>(`/register/invitation/${token}`)
}

function templateText(template: InvitationTemplate | undefined, key: string, fallback = '未配置') {
  const value = template?.payload?.[key]
  return typeof value === 'string' && value ? value : fallback
}

export function RegisterInvitationPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [manualToken, setManualToken] = useState('')
  const { data, loading, error } = useApiData(() => token ? loadInvitation(token) : Promise.resolve(null), [token])
  const [name, setName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [contact, setContact] = useState('')
  const [employeeNo, setEmployeeNo] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<RegisterResult | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await apiPost<RegisterResult>(`/register/invitation/${token}`, {
        name,
        login_name: loginName,
        contact,
        employee_no: employeeNo,
        password,
      })
      setResult(res)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '注册提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    function handleTokenSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      const raw = manualToken.trim()
      const value = raw.split('/').filter(Boolean).pop() ?? ''
      if (value) navigate(`/register/invitation/${encodeURIComponent(value)}`)
    }

    return (
      <AuthLayout>
        <div className="flex min-h-screen w-full items-center justify-center p-8">
          <form onSubmit={handleTokenSubmit} className="flex w-full max-w-[520px] flex-col gap-6 rounded-lg border border-border-subtle bg-bg-secondary p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-sm font-bold text-primary-text">N</span>
              <span className="text-xl font-bold text-text-primary">NexusFlow 邀请注册</span>
            </div>
            <Input label="邀请链接或 token" value={manualToken} onChange={(event) => setManualToken(event.target.value)} placeholder="粘贴完整邀请链接或 token" required />
            <div className="flex items-center gap-3">
              <Button>继续注册</Button>
              <Link to="/login" className="text-sm text-text-muted hover:text-text-primary">返回登录</Link>
            </div>
          </form>
        </div>
      </AuthLayout>
    )
  }

  if (result) {
    return (
      <AuthLayout>
        <div className="flex min-h-screen w-full items-center justify-center p-8">
          <div className="flex w-full max-w-[520px] flex-col gap-6 rounded-lg border border-border-subtle bg-bg-secondary p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-color-success" />
              <div className="flex flex-col">
                <h1 className="text-xl font-semibold text-text-primary">
                  {result.status === 'approved' ? '注册成功' : '注册已提交'}
                </h1>
                <span className="text-sm text-text-muted">
                  {result.status === 'approved' ? '账号已启用，可以直接登录。' : '账号待审核，审核通过后可进入系统。'}
                </span>
              </div>
            </div>
            <div className="rounded-md bg-bg-tertiary p-4 text-sm text-text-secondary">
              注册申请：{result.registration_id}
            </div>
            <Link to="/login" className="inline-flex">
              <Button>返回登录</Button>
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="flex min-h-screen w-full items-center justify-center p-8">
        <div className="grid w-full max-w-[1040px] grid-cols-[400px_1fr] overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
          <div className="flex flex-col justify-between bg-bg-tertiary p-8">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-sm font-bold text-primary-text">N</span>
                <span className="text-xl font-bold text-text-primary">NexusFlow</span>
              </div>
              <div className="flex flex-col gap-3">
                <h1 className="text-2xl font-semibold text-text-primary">邀请注册</h1>
                <p className="text-sm leading-relaxed text-text-secondary">
                  通过邀请链接创建账号，系统会按模板写入默认组织、角色和审核策略。
                </p>
              </div>
            </div>
            <Link to="/login" className="text-sm text-text-muted hover:text-text-primary">已有账号，返回登录</Link>
          </div>

          <div className="flex flex-col gap-6 p-8">
            {error && (
              <div className="flex items-start gap-3 rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {!error && !data && !loading && <EmptyState title="邀请不可用" desc="该邀请不存在或已经失效。" />}
            {data && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Info label="邀请名称" value={data.template.name ?? templateText(data.template, 'name', '邀请注册')} />
                  <Info label="邀请类型" value={data.template.invite_type ?? 'user'} />
                  <Info label="有效期" value={formatDateTime(data.expires_at)} />
                  <Info label="剩余次数" value={String(data.remaining_uses ?? 0)} />
                  <Info label="邀请组织" value={templateText(data.template, 'org_name', data.template.default_org_id ?? '未配置')} />
                  <Info label="邀请角色" value={templateText(data.template, 'role_name', `${data.template.default_role_ids?.length ?? 0} 个角色`)} />
                </div>
                <div className="flex items-center gap-2">
                  <Tag variant={data.template.need_approval ? 'warning' : 'success'}>
                    {data.template.need_approval ? '提交后需要审核' : '提交后直接启用'}
                  </Tag>
                  {data.template.default_project_id && <Tag variant="info">包含项目归属</Tag>}
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  {submitError && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{submitError}</div>}
                  <div className="grid grid-cols-2 gap-5">
                    <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} required />
                    <Input label="登录账号" value={loginName} onChange={(event) => setLoginName(event.target.value)} required />
                    <Input label="手机号或邮箱" value={contact} onChange={(event) => setContact(event.target.value)} />
                    <Input label="工号" value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} />
                  </div>
                  <Input label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={1} />
                  <div className="flex items-center gap-3">
                    <Button disabled={submitting}>{submitting ? '提交中...' : '提交注册'}</Button>
                    <span className="text-sm text-text-muted">提交后会消耗一次邀请链接使用次数。</span>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-bg-tertiary p-4">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="truncate text-sm font-medium text-text-primary">{value}</span>
    </div>
  )
}
