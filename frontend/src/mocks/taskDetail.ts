export interface Subtask {
  id: string
  title: string
  status: '已完成' | '进行中' | '待开始'
}

export interface TimelineEvent {
  id: string
  title: string
  desc: string
  time: string
}

export interface TaskDetail {
  id: string
  title: string
  project: string
  status: string
  statusVariant: 'success' | 'warning' | 'error' | 'info'
  risk: string
  riskVariant: 'success' | 'warning' | 'error' | 'info'
  owner: string
  members: string[]
  type: string
  priority: string
  start: string
  end: string
  progress: number
  createdAt: string
  updatedAt: string
  description: string
  subtasks: Subtask[]
  timeline: TimelineEvent[]
}

export const taskDetail: TaskDetail = {
  id: '1',
  title: 'Q2 科研项目里程碑评审',
  project: 'Q2 科研项目',
  status: '进行中',
  statusVariant: 'success',
  risk: '高',
  riskVariant: 'error',
  owner: '李明',
  members: ['李明', '张主任', '王芳'],
  type: '里程碑',
  priority: '高',
  start: '2025-06-10',
  end: '2025-06-20',
  progress: 65,
  createdAt: '2025-06-10',
  updatedAt: '2025-06-16',
  description:
    '完成 Q2 科研项目的里程碑评审材料准备，包括进度报告、风险评估和下一阶段计划。',
  subtasks: [
    { id: '1', title: '整理阶段成果', status: '已完成' },
    { id: '2', title: '编写风险分析', status: '进行中' },
    { id: '3', title: '预约评审会议', status: '待开始' },
  ],
  timeline: [
    { id: '1', title: '任务创建', desc: '李明 创建了该任务', time: '2025-06-10 09:30' },
    { id: '2', title: '负责人变更', desc: '负责人由 张伟 变更为 李明', time: '2025-06-12 14:20' },
    { id: '3', title: '里程碑更新', desc: '里程碑截止时间调整至 2025-06-20', time: '2025-06-16 10:05' },
  ],
}
