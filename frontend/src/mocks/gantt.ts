export type GanttDimension = 'project' | 'task' | 'people' | 'dept'
export type GanttGranularity = 'month' | 'week' | 'day'

export const ganttDimensionTabs: { value: GanttDimension; label: string }[] = [
  { value: 'project', label: '项目' },
  { value: 'task', label: '任务' },
  { value: 'people', label: '人员' },
  { value: 'dept', label: '部门' },
]

export const ganttGranularityOptions: { value: GanttGranularity; label: string }[] = [
  { value: 'month', label: '月' },
  { value: 'week', label: '周' },
  { value: 'day', label: '日' },
]

export interface GanttItem {
  id: string
  name: string
  owner: string | null
  start: string // MM/DD
  end: string // MM/DD
  progress: number | null // null for group rows / milestones
  isMilestone?: boolean
  isGroup?: boolean
  level: number
}

export const ganttStartDate = new Date('2025-04-28')
export const ganttToday = new Date('2025-05-21')

export const ganttWeeks = [
  '4.28-5.4',
  '5.5-5.11',
  '5.12-5.18',
  '5.19-5.25',
  '5.26-6.1',
  '6.2-6.8',
  '6.9-6.15',
  '6.16-6.22',
  '6.23-6.29',
  '6.30-7.6',
  '7.7-7.13',
  '7.14-7.20',
  '7.21-7.27',
  '7.28-8.3',
  '8.4-8.10',
  '8.11-8.17',
  '8.18-8.24',
  '8.25-8.31',
]

export const ganttItems: GanttItem[] = [
  { id: 'p1', name: '产品发布 2025', owner: null, start: '5/1', end: '8/31', progress: null, isGroup: true, level: 0 },
  { id: 'p1-1', name: '需求评审', owner: '张主任', start: '5/1', end: '5/15', progress: 100, level: 1 },
  { id: 'p1-2', name: '原型设计', owner: '李明', start: '5/10', end: '5/25', progress: 80, level: 1 },
  { id: 'p1-3', name: '技术评审', owner: '王芳', start: '5/20', end: '5/30', progress: 60, level: 1 },
  { id: 'p1-4', name: '开发迭代一', owner: '陈静', start: '6/1', end: '6/30', progress: 40, level: 1 },
  { id: 'p1-5', name: '开发迭代二', owner: '赵强', start: '7/1', end: '7/31', progress: 10, level: 1 },
  { id: 'p1-6', name: '集成测试', owner: '刘洋', start: '7/15', end: '8/15', progress: 0, level: 1 },
  { id: 'p1-7', name: '上线发布', owner: '张伟', start: '8/20', end: '8/20', progress: null, isMilestone: true, level: 1 },

  { id: 'p2', name: 'Q2 科研项目', owner: null, start: '5/1', end: '7/31', progress: null, isGroup: true, level: 0 },
  { id: 'p2-1', name: '立项', owner: '李明', start: '5/1', end: '5/10', progress: 100, level: 1 },
  { id: 'p2-2', name: '实验阶段', owner: '王芳', start: '5/15', end: '6/30', progress: 70, level: 1 },
  { id: 'p2-3', name: '论文撰写', owner: '陈静', start: '6/20', end: '7/31', progress: 30, level: 1 },
  { id: 'p2-4', name: '里程碑评审', owner: '张主任', start: '7/15', end: '7/15', progress: null, isMilestone: true, level: 1 },

  { id: 'p3', name: '市场活动', owner: null, start: '6/1', end: '7/10', progress: null, isGroup: true, level: 0 },
  { id: 'p3-1', name: '活动策划', owner: '张伟', start: '6/1', end: '6/10', progress: 100, level: 1 },
  { id: 'p3-2', name: '物料准备', owner: '刘洋', start: '6/10', end: '6/25', progress: 50, level: 1 },
  { id: 'p3-3', name: '活动执行', owner: '王芳', start: '6/28', end: '6/30', progress: 0, level: 1 },
  { id: 'p3-4', name: '活动复盘', owner: '李明', start: '7/5', end: '7/10', progress: 0, level: 1 },
]
