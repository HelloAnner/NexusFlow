export * from "./contracts";
export const taskTypes = ["research-company","research-department","research-center","market","business-trip","clerical","party","learning","leave"] as const;
export const fileCategories = ["personal-report","overall-report","presentation","application-report","dataset","minutes"] as const;
export const roles = ["center_director","center_deputy","department_director","department_deputy","project_lead","member","super_admin"] as const;
export const orgTypes = ["company","second_level","center","department","studio"] as const;
export type OrgType = typeof orgTypes[number];
export const orgTypeOrder: Record<OrgType, number> = { company: 0, second_level: 1, center: 2, department: 3, studio: 4 };
/** 主组织路径固定为 公司 > 二级单位 > 中心 > 部门；创新工作室横向挂在中心或部门下。 */
export function orgParentAllowed(type:string,parentType:string|null){
  if(type==="studio")return parentType==="center"||parentType==="department";
  if(!(type in orgTypeOrder)||!(parentType===null||parentType in orgTypeOrder))return false;
  if(!parentType)return type==="company";
  return type!=="company"&&orgTypeOrder[type as OrgType]===orgTypeOrder[parentType as OrgType]+1;
}
export const managementLevels = [
  { value: "center_director", label: "中心主任/书记" },
  { value: "center_deputy", label: "中心副主任/技术总监" },
  { value: "department_director", label: "部门主任/技术监督" },
  { value: "department_deputy", label: "部门副主任" },
  { value: "project_lead", label: "项目负责人" },
  { value: "staff", label: "普通员工" },
] as const;
export const professionalLevels = [
  { value: "assistant_engineer", label: "助理工程师" },
  { value: "engineer_3", label: "三级工程师" },
  { value: "engineer_2", label: "二级工程师" },
  { value: "engineer_1", label: "一级工程师" },
] as const;
export const dutyTags = [
  { value: "personnel_coordination", label: "人员协调" },
  { value: "resource_coordination", label: "资源协调" },
  { value: "project_supervision", label: "项目进度监督" },
  { value: "tech_roadmap", label: "技术选型与路线" },
  { value: "tech_training", label: "技术框架收集与培训" },
  { value: "internal_coordination", label: "内部工作协调" },
  { value: "execution", label: "成员执行" },
] as const;
export const skillGroups = [
  { key: "development", label: "研发类", tags: ["前端", "后端", "Web 端", "手机端", "PC 端", "运维", "Python", "Java", "Go", "SQL"] },
  { key: "clerical", label: "文职类", tags: ["PPT 制作", "报告撰写", "论文", "专利", "申报材料", "党建材料"] },
  { key: "support", label: "需求对接类", tags: ["技术支持", "系统培训", "需求收集", "运维客服"] },
] as const;
export const projectRoles = [
  { value: "owner", label: "负责人" },
  { value: "core", label: "核心成员" },
  { value: "participant", label: "参与成员" },
  { value: "support", label: "支持人员" },
] as const;
export const workStatuses = [
  { value: "active", label: "在岗" },
  { value: "travel", label: "出差" },
  { value: "training", label: "培训" },
  { value: "leave", label: "休假" },
  { value: "unavailable", label: "不可用" },
  { value: "disabled", label: "离职" },
] as const;
export type TaskType = typeof taskTypes[number];
export type FileCategory = typeof fileCategories[number];
export type Role = typeof roles[number];
export interface ApiRecord { id: string; created_at: string; updated_at: string; [key: string]: unknown }
