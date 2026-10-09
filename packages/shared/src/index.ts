export const taskTypes = ["research-company","research-department","research-center","market","business-trip","clerical","party","learning","leave"] as const;
export const fileCategories = ["personal-report","overall-report","presentation","application-report","dataset","minutes"] as const;
export const roles = ["center_director","center_deputy","department_director","department_deputy","project_lead","member","super_admin"] as const;
export type TaskType = typeof taskTypes[number];
export type FileCategory = typeof fileCategories[number];
export type Role = typeof roles[number];
export interface ApiRecord { id: string; created_at: string; updated_at: string; [key: string]: unknown }
