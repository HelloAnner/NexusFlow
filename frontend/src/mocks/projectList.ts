export type ProjectStatus = '进行中' | '待确认' | '待审批' | '已完成' | '有风险'

export interface ProjectListItem {
  id: string
  name: string
  code: string
  status: ProjectStatus
  type: string
  owner: string
  start: string
  end: string
  progress: number
}

export const projectStats = [
  { label: '全部项目', value: '12' },
  { label: '进行中', value: '7' },
  { label: '有风险', value: '2' },
  { label: '已完成', value: '3' },
]

export const projectFilters = ['状态', '类型', '负责组织']

export const projectList: ProjectListItem[] = [
  {
    id: '1',
    name: 'Q2 科研项目',
    code: 'K2025-001',
    status: '进行中',
    type: '科研',
    owner: '李明',
    start: '2025/05/01',
    end: '2025/07/31',
    progress: 65,
  },
  {
    id: '2',
    name: '市场支持活动',
    code: 'M2025-003',
    status: '待确认',
    type: '市场',
    owner: '王芳',
    start: '2025/06/01',
    end: '2025/06/30',
    progress: 30,
  },
  {
    id: '3',
    name: '新员工培训',
    code: 'H2025-002',
    status: '进行中',
    type: '人力',
    owner: '张伟',
    start: '2025/06/15',
    end: '2025/07/15',
    progress: 45,
  },
  {
    id: '4',
    name: '部门月度汇报',
    code: 'G2025-004',
    status: '待审批',
    type: '行政',
    owner: '刘洋',
    start: '2025/06/20',
    end: '2025/06/25',
    progress: 0,
  },
  {
    id: '5',
    name: '跨部门流程优化',
    code: 'O2025-005',
    status: '进行中',
    type: '运营',
    owner: '陈静',
    start: '2025/05/15',
    end: '2025/08/15',
    progress: 55,
  },
]
