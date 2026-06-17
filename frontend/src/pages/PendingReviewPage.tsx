import { AuthLayout } from '@/components/layout'
import { Button } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { Clock, LogOut } from 'lucide-react'

export function PendingReviewPage() {
  const { user, logout } = useAuth()

  return (
    <AuthLayout>
      <div className="flex min-h-screen flex-1 items-center justify-center bg-bg-primary p-8">
        <section className="w-full max-w-[520px] rounded-lg border border-border-subtle bg-bg-secondary p-8">
          <div className="mb-6 flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-md bg-hover-bg text-text-secondary">
              <Clock className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">账号待审核</h1>
              <p className="mt-1 text-sm text-text-muted">当前账号暂不能访问业务数据。</p>
            </div>
          </div>

          <div className="space-y-3 rounded-md bg-bg-tertiary p-4 text-sm text-text-secondary">
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">登录账号</span>
              <span className="font-medium text-text-primary">{user?.login_name ?? '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">账号状态</span>
              <span className="font-medium text-text-primary">待审核</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">下一步</span>
              <span className="text-right font-medium text-text-primary">等待 SA 或管理员审核通过</span>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="secondary" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              退出登录
            </Button>
          </div>
        </section>
      </div>
    </AuthLayout>
  )
}
