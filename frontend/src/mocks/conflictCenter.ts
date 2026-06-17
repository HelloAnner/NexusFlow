import type { Conflict } from '@/types'

export type ConflictStatus = '待处理' | '处理中' | '已解决'

export interface ConflictItem extends Omit<Conflict, 'status'> {
  status: ConflictStatus
  target: string
}

export const topStats = [
  { label: '待处理冲突', value: '5', sub: '较昨日 +1' },
  { label: '高风险', value: '2', sub: '需立即处理' },
  { label: '今日新增', value: '1', sub: '6月17日' },
  { label: '超时未处理', value: '1', sub: '超过 24h' },
]

export const filterTabs = [
  { value: 'all', label: '全部 8' },
  { value: 'overload', label: '人员超载 2' },
  { value: 'time', label: '时间冲突 2' },
  { value: 'org', label: '跨组织 1' },
  { value: 'permission', label: '权限 1' },
  { value: 'resource', label: '资源 2' },
]

export const conflicts: ConflictItem[] = [
  {
    id: '1',
    type: '人员超载',
    level: '高',
    title: '王芳 6/18-19 任务超载',
    desc: '6月18-19日任务分配合计 120%，超过可用工时。',
    people: ['王芳'],
    tasks: [],
    time: '6月18日',
    status: '待处理',
    target: '王芳',
  },
  {
    id: '2',
    type: '时间冲突',
    level: '中',
    title: '李明时间冲突',
    desc: 'Q2科研项目评审会与市场部周会时间重叠 14:00-16:00。',
    people: ['李明'],
    tasks: [],
    time: '6月20日',
    status: '待处理',
    target: '李明',
  },
  {
    id: '3',
    type: '资源冲突',
    level: '中',
    title: '会议室 A 重复预定',
    desc: '6月20日 14:00-16:00 被两个会议同时预定。',
    people: [],
    tasks: [],
    time: '6月20日',
    status: '待处理',
    target: '会议室 A',
  },
  {
    id: '4',
    type: '跨组织冲突',
    level: '高',
    title: '市场支持任务跨组织争抢',
    desc: '市场支持任务负责人与研发排期冲突，需协调资源。',
    people: ['市场部', '研发部'],
    tasks: [],
    time: '6月17日',
    status: '处理中',
    target: '市场部/研发部',
  },
  {
    id: '5',
    type: '权限冲突',
    level: '低',
    title: '张主任权限冲突',
    desc: '审批权限范围与当前项目归属不一致，存在越权风险。',
    people: ['张主任'],
    tasks: [],
    time: '6月16日',
    status: '已解决',
    target: '张主任',
  },
]

export const summaryStats = [
  { label: '待处理', value: '5' },
  { label: '高风险', value: '2' },
  { label: '已解决', value: '1' },
]

export const typeDistribution = [
  { label: '人员超载', value: '2' },
  { label: '时间冲突', value: '2' },
  { label: '资源冲突', value: '2' },
  { label: '跨组织冲突', value: '1' },
  { label: '权限冲突', value: '1' },
]

export const deptWarnings = [
  { label: '市场部', value: '2 个冲突' },
  { label: '研发部', value: '2 个冲突' },
  { label: '行政部', value: '1 个冲突' },
]

export const myTasks = [
  { id: '1', name: 'Q2 科研项目里程碑评审', end: '6月20日', status: '进行中', tag: 'success' as const },
  { id: '2', name: '部门月度汇报PPT', end: '6月18日', status: '待确认', tag: 'warning' as const },
  { id: '3', name: '跨部门人员协调：市场支持', end: '6月19日', status: '待审批', tag: 'error' as const },
  { id: '4', name: '新员工培训资料准备', end: '6月25日', status: '进行中', tag: 'success' as const },
  { id: '5', name: '出差：北京技术交流', end: '6月22日', status: '进行中', tag: 'success' as const },
]

export const todos = [
  { id: '1', title: '确认市场支持任务人员安排', type: '审批' },
  { id: '2', title: '审核李明的阶段成果', type: '验收' },
  { id: '3', title: '处理王芳的负载冲突', type: '冲突' },
  { id: '4', title: '补充科研项目资料', type: '资料' },
]

export const risks = [
  { id: '1', title: 'Q2 科研项目', desc: '延期风险', tag: '2天' },
  { id: '2', title: '王芳', desc: '负载超载', tag: '6月18-19日' },
  { id: '3', title: '市场支持任务', desc: '跨部门未审批', tag: '待处理' },
]
