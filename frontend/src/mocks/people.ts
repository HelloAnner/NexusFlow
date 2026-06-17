export interface Person {
  id: string
  name: string
  dept: string
  role: string
  level: string
  skills: string[]
  tasks: number
  load: number
  workStatus: '在岗' | '出差' | '休假'
  accountStatus: '启用' | '锁定'
}

export const peopleStats = [
  { label: '全部人员', value: 42 },
  { label: '负载正常', value: 32 },
  { label: '负载超载', value: 6 },
  { label: '负载不足', value: 4 },
]

export const peopleFilters = ['组织', '角色', '技能', '工作状态', '账号状态']

export const people: Person[] = [
  {
    id: '1',
    name: '李明',
    dept: '研发部',
    role: '项目负责人',
    level: '高级工程师',
    skills: ['后端', 'Python'],
    tasks: 5,
    load: 55,
    workStatus: '在岗',
    accountStatus: '启用',
  },
  {
    id: '2',
    name: '王芳',
    dept: '研发部',
    role: '员工',
    level: '工程师',
    skills: ['前端', 'UI'],
    tasks: 7,
    load: 110,
    workStatus: '在岗',
    accountStatus: '启用',
  },
  {
    id: '3',
    name: '张伟',
    dept: '市场部',
    role: '员工',
    level: '中级工程师',
    skills: ['PPT', '报告'],
    tasks: 3,
    load: 45,
    workStatus: '出差',
    accountStatus: '启用',
  },
  {
    id: '4',
    name: '刘洋',
    dept: '运维部',
    role: '员工',
    level: '工程师',
    skills: ['运维', 'SQL'],
    tasks: 6,
    load: 85,
    workStatus: '在岗',
    accountStatus: '启用',
  },
  {
    id: '5',
    name: '陈静',
    dept: '行政部',
    role: '员工',
    level: '助理工程师',
    skills: ['党建', '材料'],
    tasks: 2,
    load: 30,
    workStatus: '休假',
    accountStatus: '启用',
  },
  {
    id: '6',
    name: '赵强',
    dept: '市场部',
    role: '员工',
    level: '工程师',
    skills: ['需求', '培训'],
    tasks: 8,
    load: 95,
    workStatus: '在岗',
    accountStatus: '锁定',
  },
]
