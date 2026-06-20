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
      <div className="flex min-h-screen w-full bg-bg-secondary">
        <div className="hidden flex-1 flex-col justify-center bg-primary-fill p-8 text-primary-text lg:flex">
          <div className="max-w-[560px]">
            <h1 className="text-3xl font-bold leading-tight">{branding.system_name}</h1>
            <p className="mt-5 text-lg font-semibold text-white/90">统一工作管理与资源调度平台</p>
            <div className="mt-12 grid max-w-[520px] grid-cols-3 gap-3 text-sm text-white/70">
              <div className="rounded-md border border-white/10 p-4">
                <div className="text-2xl font-bold text-white">01</div>
                <div className="mt-2">任务派发</div>
              </div>
              <div className="rounded-md border border-white/10 p-4">
                <div className="text-2xl font-bold text-white">02</div>
                <div className="mt-2">资源负载</div>
              </div>
              <div className="rounded-md border border-white/10 p-4">
                <div className="text-2xl font-bold text-white">03</div>
                <div className="mt-2">审批归档</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full items-center justify-center p-8 lg:w-[480px]">
          <form onSubmit={handleSubmit} className="w-full max-w-[416px]">
            <div className="mb-10 lg:hidden">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-fill text-primary-text">
                  <span className="text-sm font-bold">{branding.system_name.charAt(0)}</span>
                </span>
                <span className="text-xl font-bold text-text-primary">{branding.system_name}</span>
              </div>
              <p className="mt-2 text-sm text-text-muted">统一工作管理与资源调度平台</p>
            </div>
            <h2 className="mb-5 text-3xl font-bold text-text-primary">登录</h2>
            <div className="flex flex-col gap-4">
              <Input
                label="账号"
                placeholder="请输入账号"
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
                <div className="rounded-md bg-color-error-bg px-3 py-2 text-sm text-color-error">
                  {error}
                </div>
              )}
              <Button className="mt-1 h-11 w-fit px-4" disabled={submitting}>
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
      </div>
    </AuthLayout>
  )
}
