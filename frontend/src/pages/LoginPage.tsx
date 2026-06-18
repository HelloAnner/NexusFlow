import { AuthLayout } from '@/components/layout'
import { Button, Input } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useBranding } from '@/lib/branding'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

interface RoleEntryResponse {
  entry?: {
    default_home?: string
  }
}

function normalizeHomePath(path?: string) {
  if (!path || path === '/dashboard') return '/'
  return path.startsWith('/') ? path : '/'
}

async function loadDefaultHome() {
  try {
    const res = await apiGet<RoleEntryResponse>('/dashboard/role-entry')
    return normalizeHomePath(res.entry?.default_home)
  } catch {
    return '/'
  }
}

export function LoginPage() {
  const { user, login } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()
  const [loginName, setLoginName] = useState(import.meta.env.DEV ? 'Anner' : '')
  const [password, setPassword] = useState(import.meta.env.DEV ? '1' : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(loginName, password)
      navigate(await loadDefaultHome(), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="flex w-[560px] flex-col justify-center gap-10 bg-bg-secondary p-10">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-primary-text">
            <span className="text-sm font-bold">{branding.system_name.charAt(0)}</span>
          </span>
          <span className="min-w-0 truncate text-2xl font-bold text-text-primary">{branding.system_name}</span>
        </div>
        <div className="flex flex-col gap-5">
          <h1 className="text-[32px] font-bold leading-tight text-text-primary">统一工作协同平台</h1>
          <p className="text-base text-text-secondary">
            从任务发起到归档，覆盖人员、项目、负载、审批与资料的全流程管理。
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {['任务派发与跨部门协调', '人员负载与冲突预警', '项目归属与资料归档'].map((f) => (
            <div key={f} className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-text-secondary" />
              <span className="text-base text-text-secondary">{f}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-10">
        <form
          onSubmit={handleSubmit}
          className="w-[440px] rounded-2xl border border-border-subtle bg-bg-secondary p-8"
        >
          <h2 className="mb-6 text-xl font-semibold text-text-primary">登录</h2>
          <div className="flex flex-col gap-5">
            <Input
              label="登录账号"
              placeholder="请输入工号或账号"
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
            />
            <Input
              label="密码"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">
                {error}
              </div>
            )}
            <Button className="w-fit" disabled={submitting}>
              {submitting ? '登录中...' : '登录'}
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-between text-sm text-text-muted">
            <Link to="#" className="hover:text-text-primary">
              忘记密码
            </Link>
            <Link to="/register/invitation" className="hover:text-text-primary">
              邀请注册
            </Link>
          </div>
        </form>
      </div>
    </AuthLayout>
  )
}
