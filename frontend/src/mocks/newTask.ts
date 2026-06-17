export const taskTypeOptions = [
  { value: '', label: '请选择' },
  { value: '科研', label: '科研' },
  { value: '市场支持', label: '市场支持' },
  { value: '行政', label: '行政' },
  { value: '培训', label: '培训' },
  { value: '出差', label: '出差' },
]

export const priorityOptions = [
  { value: '', label: '请选择' },
  { value: '低', label: '低' },
  { value: '中', label: '中' },
  { value: '高', label: '高' },
  { value: '紧急', label: '紧急' },
]

export const ownerOptions = [
  { value: '', label: '请选择' },
  { value: '张明', label: '张明' },
  { value: '李华', label: '李华' },
  { value: '王芳', label: '王芳' },
  { value: '赵强', label: '赵强' },
  { value: '刘洋', label: '刘洋' },
]

export const projectOptions = [
  { value: '', label: '请选择' },
  { value: 'Q2 科研项目', label: 'Q2 科研项目' },
  { value: '市场拓展计划', label: '市场拓展计划' },
  { value: '新员工培训体系', label: '新员工培训体系' },
  { value: '年度技术交流', label: '年度技术交流' },
]

export const defaultFormValues = {
  title: '',
  type: '',
  priority: '',
  owner: '',
  project: '',
  start: '2025-06-18',
  end: '2025-06-25',
  description: '',
}

export const steps = [
  { value: 1, label: '基本信息' },
  { value: 2, label: '资源分配' },
  { value: 3, label: '确认' },
]
