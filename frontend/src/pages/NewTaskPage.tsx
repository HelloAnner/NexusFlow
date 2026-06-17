import { MainLayout } from '@/components/layout'
import { Button, Input, Select } from '@/components/ui'
import {
  defaultFormValues,
  ownerOptions,
  priorityOptions,
  projectOptions,
  steps,
  taskTypeOptions,
} from '@/mocks/newTask'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

export function NewTaskPage() {
  const [form, setForm] = useState(defaultFormValues)

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <MainLayout title="新建任务" subtitle="创建一个新任务并分配负责人">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 text-sm">
          {steps.map((step, index) => {
            const isActive = step.value === 1
            return (
              <div key={step.value} className="flex items-center gap-3">
                <div
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium ${
                    isActive
                      ? 'bg-primary-fill text-primary-text'
                      : 'text-text-muted'
                  }`}
                >
                  <span>{step.value}</span>
                  <span>{step.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <span className="text-text-muted">&gt;</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Form Container */}
        <div className="rounded-lg border border-border-subtle bg-bg-secondary p-8">
          <h2 className="mb-8 text-xl font-semibold text-text-primary">新建任务</h2>

          <div className="flex flex-col gap-6">
            {/* Title Field */}
            <Input
              label="任务标题"
              placeholder="请输入任务标题"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
            />

            {/* Row 1 */}
            <div className="grid grid-cols-2 gap-5">
              <Select
                label="任务类型"
                options={taskTypeOptions}
                value={form.type}
                onChange={(e) => updateField('type', e.target.value)}
              />
              <Select
                label="优先级"
                options={priorityOptions}
                value={form.priority}
                onChange={(e) => updateField('priority', e.target.value)}
              />
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-2 gap-5">
              <Select
                label="负责人"
                options={ownerOptions}
                value={form.owner}
                onChange={(e) => updateField('owner', e.target.value)}
              />
              <Select
                label="所属项目"
                options={projectOptions}
                value={form.project}
                onChange={(e) => updateField('project', e.target.value)}
              />
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-2 gap-5">
              <Input
                label="开始时间"
                type="date"
                value={form.start}
                onChange={(e) => updateField('start', e.target.value)}
              />
              <Input
                label="截止时间"
                type="date"
                value={form.end}
                onChange={(e) => updateField('end', e.target.value)}
              />
            </div>

            {/* Description Field */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-muted">任务描述</label>
              <textarea
                rows={4}
                placeholder="请输入任务描述..."
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full resize-none rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary placeholder:text-text-placeholder focus:border-text-muted focus:outline-none transition-fast"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-4 pt-2">
              <Link to="/tasks" className="inline-flex">
                <Button variant="ghost">取消</Button>
              </Link>
              <Button>创建任务</Button>
              <Button variant="secondary">保存草稿</Button>
            </div>

            {/* Conflict Tip */}
            <div className="flex items-center gap-2 rounded-md bg-bg-tertiary px-4 py-3 text-sm text-text-muted">
              <Info className="h-4 w-4 shrink-0 text-text-muted" />
              <span>保存草稿不会占用人员工时，提交前将自动进行冲突检查</span>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
