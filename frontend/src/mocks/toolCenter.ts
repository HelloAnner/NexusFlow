export type ToolSection = 'common' | 'agent'
export type ToolTag = 'all' | 'common' | 'agent' | 'doc' | 'format'

export interface ToolItem {
  id: string
  name: string
  category: string
  description: string
  icon: string
  section: ToolSection
  tags: ToolTag[]
}

export interface FavoriteItem {
  id: string
  name: string
  useCount: string
  icon: string
}

export interface RecommendedItem {
  id: string
  name: string
  reason: string
  icon: string
}

export const toolTabs = [
  { value: 'all', label: '全部' },
  { value: 'common', label: '常用工具' },
  { value: 'agent', label: '智能体' },
  { value: 'doc', label: '文档处理' },
  { value: 'format', label: '格式转换' },
]

export const commonTools: ToolItem[] = [
  {
    id: 'pdf',
    name: 'PDF 转换',
    category: '文档处理',
    description: 'PDF 与 Word/Excel/PPT 互转',
    icon: 'FileText',
    section: 'common',
    tags: ['all', 'common', 'doc', 'format'],
  },
  {
    id: 'translate',
    name: '文档翻译',
    category: '翻译',
    description: '多语言文档一键翻译',
    icon: 'Languages',
    section: 'common',
    tags: ['all', 'common', 'doc'],
  },
  {
    id: 'table',
    name: '表格处理',
    category: '数据处理',
    description: 'Excel 清洗、合并、统计',
    icon: 'Table',
    section: 'common',
    tags: ['all', 'common', 'format'],
  },
  {
    id: 'image',
    name: '图片压缩',
    category: '图片',
    description: '批量压缩与格式转换',
    icon: 'Image',
    section: 'common',
    tags: ['all', 'common', 'format'],
  },
]

export const agentTools: ToolItem[] = [
  {
    id: 'paper',
    name: '论文辅助',
    category: 'AI 撰写',
    description: '论文大纲、润色与参考文献整理',
    icon: 'ScrollText',
    section: 'agent',
    tags: ['all', 'agent'],
  },
  {
    id: 'patent',
    name: '专利辅助',
    category: 'AI 撰写',
    description: '专利技术交底书与权利要求书',
    icon: 'Award',
    section: 'agent',
    tags: ['all', 'agent'],
  },
  {
    id: 'knowledge',
    name: '个人知识库',
    category: 'AI 知识',
    description: '基于上传资料的智能问答',
    icon: 'BookOpen',
    section: 'agent',
    tags: ['all', 'agent'],
  },
  {
    id: 'presentation',
    name: '汇报材料辅助',
    category: 'AI 撰写',
    description: 'PPT 大纲、发言稿生成',
    icon: 'Presentation',
    section: 'agent',
    tags: ['all', 'agent'],
  },
]

export const favoriteTools: FavoriteItem[] = [
  { id: 'pdf', name: 'PDF 转换', useCount: '本周使用 5 次', icon: 'FileText' },
  { id: 'paper', name: '论文辅助', useCount: '本周使用 3 次', icon: 'ScrollText' },
  { id: 'table', name: '表格处理', useCount: '本周使用 2 次', icon: 'Table' },
]

export const recommendedTools: RecommendedItem[] = [
  { id: 'presentation', name: '汇报材料辅助', reason: '适合当前任务', icon: 'Presentation' },
  { id: 'patent', name: '专利辅助', reason: '市场项目推荐', icon: 'Award' },
  { id: 'image', name: '图片压缩', reason: '常用未收藏', icon: 'Image' },
]
