import { AuthLayout } from '@/components/layout'
import { Button, Input } from '@/components/ui'
import { Link } from 'react-router-dom'

export function LoginPage() {
  return (
    <AuthLayout>
      <div className="flex w-[560px] flex-col justify-center gap-10 bg-bg-secondary p-10">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-fill text-primary-text">
            <span className="text-sm font-bold">N</span>
          </span>
          <span className="text-2xl font-bold text-text-primary">NexusFlow</span>
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
        <div className="w-[440px] rounded-2xl border border-border-subtle bg-bg-secondary p-8">
          <h2 className="mb-6 text-xl font-semibold text-text-primary">登录</h2>
          <div className="flex flex-col gap-5">
            <Input label="登录账号" placeholder="请输入工号或账号" />
            <Input label="密码" type="password" placeholder="请输入密码" />
            <Button className="w-fit">登录</Button>
          </div>
          <div className="mt-6 flex items-center justify-between text-sm text-text-muted">
            <Link to="#" className="hover:text-text-primary">
              忘记密码
            </Link>
            <Link to="#" className="hover:text-text-primary">
              邀请注册
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
