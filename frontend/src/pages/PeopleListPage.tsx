import { MainLayout } from '@/components/layout'
import { Avatar, EmptyState, LoadIndicator, StatCard, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { type ApiList, type ApiPerson, accountStatusLabel, numberValue, textFromPayload, workStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { ChevronDown } from 'lucide-react'

const peopleFilters = ['组织', '技能', '项目', '工作状态', '账号状态']

function workVariant(status?: string) {
  if (status === 'active') return 'success'
  if (status === 'business_trip') return 'warning'
  return 'error'
}

function accountVariant(status?: string) {
  if (status === 'enabled') return 'success'
  if (status === 'pending') return 'warning'
  return 'error'
}

export function PeopleListPage() {
  const { data, loading, error } = useApiData(() => apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }))
  const people = data?.items ?? []
  const active = people.filter((person) => person.work_status === 'active').length
  const enabled = people.filter((person) => person.account_status === 'enabled').length
  const dispatchable = people.filter((person) => person.dispatch_enabled).length

  return (
    <MainLayout title="人员" subtitle="部门人员与负载状态">
      <div className="flex flex-col gap-8">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}
        <div className="grid grid-cols-4 gap-5">
          <StatCard label="人员总数" value={people.length} sub={loading ? '加载中' : '真实人员数据'} />
          <StatCard label="在岗" value={active} />
          <StatCard label="账号启用" value={enabled} />
          <StatCard label="可派发" value={dispatchable} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {peopleFilters.map((filter) => (
              <button
                key={filter}
                className="inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-5 py-3 text-sm text-text-secondary transition-fast hover:bg-hover-bg"
              >
                {filter}
                <ChevronDown className="h-3 w-3 text-text-muted" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col rounded-lg border border-border-subtle bg-bg-secondary">
          <Table>
            <Thead>
              <Tr><Th>姓名</Th><Th>主组织</Th><Th>角色</Th><Th>人员等级</Th><Th>技能标签</Th><Th>本周负载</Th><Th>工作状态</Th><Th>账号状态</Th></Tr>
            </Thead>
            <Tbody>
              {people.map((person) => {
                const load = numberValue(person.payload?.weekly_load, person.dispatch_enabled ? 40 : 0)
                const skills = Array.isArray(person.payload?.skills) ? person.payload.skills.map(String) : []
                return (
                  <Tr key={person.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={person.name} className="h-7 w-7" />
                        <span className="text-base font-medium text-text-primary">{person.name}</span>
                      </div>
                    </Td>
                    <Td>{textFromPayload(person.payload, 'org_name', person.primary_org_id ?? '未设置')}</Td>
                    <Td>{textFromPayload(person.payload, 'role_name', '成员')}</Td>
                    <Td>{textFromPayload(person.payload, 'level', '未设置')}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        {(skills.length ? skills : ['未标记']).slice(0, 3).map((skill) => (
                          <span key={skill} className="rounded-sm bg-hover-bg px-2 py-1 text-xs text-text-muted">{skill}</span>
                        ))}
                      </div>
                    </Td>
                    <Td><LoadIndicator value={load} /></Td>
                    <Td><Tag variant={workVariant(person.work_status)}>{workStatusLabel(person.work_status)}</Tag></Td>
                    <Td><Tag variant={accountVariant(person.account_status)}>{accountStatusLabel(person.account_status)}</Tag></Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
          {!loading && people.length === 0 && <EmptyState title="暂无人员" desc="当前可见范围内没有人员。" />}
        </div>
      </div>
    </MainLayout>
  )
}
