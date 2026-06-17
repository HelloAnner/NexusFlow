export interface ConfigWorkflow {
  id: string
  name: string
  desc: string
  value: string
}

export interface ConfigPermission {
  id: string
  name: string
  desc: string
  value: string
}

export interface ConfigNotify {
  id: string
  name: string
  desc: string
  value: string
}

export interface ConfigMenuItem {
  id: string
  label: string
}

export const configMenuItems: ConfigMenuItem[] = [
  { id: 'workflow', label: '流程模板' },
  { id: 'permission', label: '权限模板' },
  { id: 'notify', label: '通知规则' },
  { id: 'integration', label: '系统集成' },
  { id: 'params', label: '系统参数' },
  { id: 'security', label: '安全设置' },
]

export const configStats = [
  { id: 'workflow', label: '流程模板', value: '6' },
  { id: 'permission', label: '权限模板', value: '4' },
  { id: 'notify', label: '通知规则', value: '12' },
]

export const workflowTemplates: ConfigWorkflow[] = [
  { id: '1', name: '任务审批流程', desc: '直属上级 → 部门负责人 → 分管领导', value: '3级审批' },
  { id: '2', name: '项目立项流程', desc: '部门负责人审批', value: '1级审批' },
  { id: '3', name: '跨组织任务确认', desc: '双方负责人确认', value: '并行确认' },
  { id: '4', name: '出差审批流程', desc: '部门负责人 → 行政备案', value: '2级审批' },
  { id: '5', name: '报销审批流程', desc: '财务初审 → 部门负责人', value: '2级审批' },
]

export const permissionTemplates: ConfigPermission[] = [
  { id: '1', name: '部门管理员', desc: '本部门全部数据与人员', value: '编辑' },
  { id: '2', name: '项目负责人', desc: '项目内全部任务与资料', value: '编辑' },
  { id: '3', name: '普通成员', desc: '仅自己负责的任务', value: '查看' },
  { id: '4', name: '外部协作者', desc: '仅被指派任务', value: '受限' },
]

export const notifyRules: ConfigNotify[] = [
  { id: '1', name: '任务到期提醒', desc: '到期前1天提醒负责人', value: '邮件+应用内' },
  { id: '2', name: '审批通知', desc: '审批流到达时即时推送', value: '即时推送' },
  { id: '3', name: '冲突预警', desc: '每日09:00汇总推送', value: '每日摘要' },
  { id: '4', name: '周报生成', desc: '每周一自动生成并推送', value: '周一推送' },
]

export const myTasks = [
  { id: '1', name: 'Q2 科研项目里程碑评审', end: '6月20日', status: '进行中', tag: 'success' as const },
  { id: '2', name: '部门月度汇报PPT', end: '6月18日', status: '待确认', tag: 'warning' as const },
  { id: '3', name: '跨部门人员协调：市场支持', end: '6月19日', status: '待审批', tag: 'error' as const },
  { id: '4', name: '新员工培训资料准备', end: '6月25日', status: '进行中', tag: 'success' as const },
  { id: '5', name: '出差：北京技术交流', end: '6月22日', status: '进行中', tag: 'success' as const },
]

export const myTodos = [
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
