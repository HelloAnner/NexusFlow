import type { TaskStatus } from '@/types'

export interface TaskListItem {
  id: string
  name: string
  desc: string
  status: TaskStatus
  type: string
  owner: string
  dateRange: string
  progress: number | null
  risk: string
}

export const taskList: TaskListItem[] = [
  {
    id: '1',
    name: 'Q2 科研项目里程碑评审',
    desc: '里程碑评审 · 4人参与',
    status: '进行中',
    type: '科研',
    owner: '张主任',
    dateRange: '6.15-6.30',
    progress: 65,
    risk: '正常',
  },
  {
    id: '2',
    name: '部门月度汇报PPT',
    desc: '里程碑评审 · 4人参与',
    status: '待确认',
    type: '文职',
    owner: '李芳',
    dateRange: '6.18-6.19',
    progress: 0,
    risk: '低',
  },
  {
    id: '3',
    name: '跨部门人员协调：市场支持',
    desc: '里程碑评审 · 4人参与',
    status: '待审批',
    type: '市场',
    owner: '王强',
    dateRange: '6.19-6.25',
    progress: 0,
    risk: '高',
  },
  {
    id: '4',
    name: '新员工培训资料准备',
    desc: '里程碑评审 · 4人参与',
    status: '进行中',
    type: '培训',
    owner: '赵敏',
    dateRange: '6.20-6.25',
    progress: 30,
    risk: '正常',
  },
  {
    id: '5',
    name: '出差：北京技术交流',
    desc: '里程碑评审 · 4人参与',
    status: '进行中',
    type: '出差',
    owner: '陈明',
    dateRange: '6.22-6.24',
    progress: null,
    risk: '正常',
  },
  {
    id: '6',
    name: '党建材料整理',
    desc: '里程碑评审 · 4人参与',
    status: '已完成',
    type: '党建',
    owner: '刘洋',
    dateRange: '6.10-6.16',
    progress: 100,
    risk: '正常',
  },
]
