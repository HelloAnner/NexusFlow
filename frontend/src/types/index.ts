export type TaskStatus = '进行中' | '待确认' | '待审批' | '已完成' | '已暂停' | '有风险'
export type Priority = '低' | '中' | '高' | '紧急'
export type RiskLevel = '低' | '中' | '高'

export interface Task {
  id: string
  name: string
  type: string
  status: TaskStatus
  priority: Priority
  owner: string
  members: string[]
  start: string
  end: string
  progress: number
  risk?: RiskLevel
}

export interface Project {
  id: string
  name: string
  code: string
  type: string
  level: string
  status: string
  owner: string
  members: number
  progress: number
  risk: RiskLevel
  completeness: number
}

export interface Person {
  id: string
  name: string
  dept: string
  role: string
  level: string
  skills: string[]
  tasks: number
  load: number
  status: string
}

export interface Conflict {
  id: string
  type: string
  level: RiskLevel
  title: string
  desc: string
  people: string[]
  tasks: string[]
  time: string
  status: '待处理' | '处理中' | '已解决'
}

export interface TodoItem {
  id: string
  title: string
  type: string
}

export interface RiskAlert {
  id: string
  title: string
  desc: string
  tag: string
}
