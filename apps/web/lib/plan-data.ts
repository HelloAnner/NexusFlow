import type { GanttGroup,GanttTask } from "./demo";
import { isRecord,type QueryState } from "./query-state";
import { dayDiff } from "./utils";

type PlanState={kind:"pending"}|{kind:"error";message:string}|{kind:"empty";message:string}|{kind:"ready";project:Record<string,unknown>;groups:GanttGroup[];start:string;days:number};
function strings(value:Record<string,unknown>,keys:string[]){return keys.every(key=>typeof value[key]==="string");}
function task(value:unknown):value is GanttTask{
 if(!isRecord(value)||!strings(value,["id","name"])||!value.id||!value.name||typeof value.kind!=="string"||!["done","prog","plan","mixed"].includes(value.kind)||typeof value.start!=="number"||typeof value.end!=="number"||!Number.isFinite(value.start)||!Number.isFinite(value.end)||value.end<value.start)return false;
 if(value.progress!==undefined&&(typeof value.progress!=="number"||!Number.isFinite(value.progress)||value.progress<0||value.progress>100))return false;
 if(value.overdueTo!==undefined&&(typeof value.overdueTo!=="number"||!Number.isFinite(value.overdueTo)))return false;
 if(["note","overdueLabel"].some(key=>value[key]!==undefined&&typeof value[key]!=="string"))return false;
 return value.popover===undefined||(isRecord(value.popover)&&strings(value.popover,["owner","ownerColor","plan","forecast","blockedBy","code"]));
}
function group(value:unknown):value is GanttGroup{return isRecord(value)&&strings(value,["type","typeColor","owner","ownerColor"])&&Array.isArray(value.tasks)&&value.tasks.every(task);}
export function projectPlanState(id:string,projects:QueryState<Record<string,unknown>>,groups:QueryState<unknown>):PlanState{
 if(projects.kind==="pending"||projects.kind==="error")return projects;
 const project=projects.kind==="ready"?projects.items.find(row=>row.id===id):undefined;
 if(!project)return {kind:"empty",message:"项目不存在或不可见"};
 if(groups.kind==="pending"||groups.kind==="error")return groups;
 if(groups.kind==="empty")return {kind:"empty",message:"暂无项目任务"};
 if(!groups.items.every(group))return {kind:"error",message:"项目计划分组格式无效"};
 if(groups.items.every(row=>row.tasks.length===0))return {kind:"empty",message:"暂无项目任务"};
 const start=project.start_date,end=project.end_date;
 if(typeof start!=="string"||typeof end!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(dayDiff(start,end))||dayDiff(start,end)<0)return {kind:"error",message:"项目计划周期不可用"};
 return {kind:"ready",project,groups:groups.items,start,days:Math.max(1,dayDiff(start,end))};
}
