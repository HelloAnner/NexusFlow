import { addAudit } from "../../shared/audit.ts";
import { assertSeedAllowed } from "./policy.ts";
type SeedMatch={name?:string;userId?:string;taskId?:string;personId?:string;type?:string;toolId?:string;dispatchId?:string;step?:string;sourceId?:string};
import { actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { insertRecord } from "../../records.ts";
import { buildDemoSeed,demoTools } from "../../demo-seed.ts";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { conflicts } from "../conflicts/service.ts";
const uid=()=>crypto.randomUUID();
async function issueDemoCredentials(tx:any,people:ReturnType<typeof buildDemoSeed>["people"],tenantId:string|null){const credentials:{username:string;password:string}[]=[];for(const person of people){const username=`demo.${person.username}`,password=randomBytes(24).toString("base64url"),passwordHash=await bcrypt.hash(password,10),updated=await tx`UPDATE nexusflow.users SET password_hash=${passwordHash},updated_at=now() WHERE tenant_id IS NOT DISTINCT FROM ${tenantId} AND lower(username)=lower(${username}) AND portal_id IS NULL AND status='active' RETURNING id`;if(!updated.length)throw new Error(`demo account is unavailable: ${username}`);credentials.push({username,password});}return credentials;}
// Xmin pins an untouched v3 transaction; graph matching repairs older v4 markers whose xmin has already changed.
async function repairV3DemoRelations(tx:any,user:ReturnType<typeof actor>,marker:Record<string,any>,plan:ReturnType<typeof buildDemoSeed>,legacyV4=false){
 // Pending: historical name/graph inference is not trusted provenance. This helper cannot write.
 assertSeedAllowed(user);throw new Error("forbidden: legacy seed repair pending trusted provenance migration");
 const graphMatch=legacyV4||!marker.seed_xid,cohort=(kind:string)=>graphMatch?tx`SELECT id,data FROM nexusflow.records WHERE kind=${kind} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`:tx`SELECT id,data FROM nexusflow.records WHERE kind=${kind} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND xmin::text=${marker.seed_xid}`;
 const [legacyTasks,legacyProjects,assignmentRows]=await Promise.all([cohort("tasks"),cohort("projects"),cohort("task_assignments")]);
 if(!legacyTasks.length||!legacyProjects.length||!assignmentRows.length)throw new Error("demo seed relationship provenance is incomplete; seed version was not advanced");
 const accounts=new Map<string,any>();for(const person of plan.people){const rows=await tx`SELECT id,org_id,status FROM nexusflow.users WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND lower(username)=lower(${`demo.${person.username}`}) LIMIT 1`;if(!rows[0]||!rows[0].org_id)throw new Error(`demo account is unavailable: demo.${person.username}`);accounts.set(String(person.username),rows[0]);}
 const taskRows:any[]=[],projects=new Map<string,any>(),assignmentIds:string[]=[];for(const task of plan.tasks){const owner=accounts.get(String(plan.people[task.owner_index]!.username)),projectName=String(plan.projects[task.project_index]!.name),candidates=legacyTasks.filter((r:any)=>r.data?.name===String(task.name)&&r.data?.owner_id===owner.id),matches=candidates.flatMap((row:any)=>{const project=legacyProjects.find((r:any)=>r.id===row.data?.project_id),assignments=assignmentRows.filter((r:any)=>r.data?.task_id===row.id&&r.data?.user_id===owner.id);return project?.data?.name===projectName&&assignments.length===1?[{row,project,assignment:assignments[0]}]:[];});if(matches.length!==1)throw new Error(`demo task provenance is incomplete or ambiguous: ${task.name}`);const {row,project,assignment}=matches[0],previous=projects.get(projectName);if(previous&&previous.id!==project.id)throw new Error(`demo project provenance is ambiguous: ${projectName}`);projects.set(projectName,project);taskRows.push({row,owner,project});assignmentIds.push(String(assignment.id));}
 if(!graphMatch){if(legacyProjects.length!==plan.projects.length)throw new Error("v3 project cohort is incomplete; relationships were not changed");for(const project of plan.projects)if(legacyProjects.filter((r:any)=>r.data?.name===String(project.name)).length!==1)throw new Error(`v3 project provenance is ambiguous: ${project.name}`);for(const project of plan.projects){const match=legacyProjects.find((r:any)=>r.data?.name===String(project.name))!;projects.set(String(project.name),match);}}
 const projectOwners=new Map<string,Set<string>>();for(const {project,owner} of taskRows){const ids=projectOwners.get(String(project.id))||new Set<string>();ids.add(String(owner.id));projectOwners.set(String(project.id),ids);}
 const accountIds=new Set<string>((await tx`SELECT id FROM nexusflow.users WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`).map((account:any)=>String(account.id)));
 for(const {row,owner} of taskRows){const members=new Set<string>((Array.isArray(row.data.member_ids)?row.data.member_ids:[]).map(String).filter((id:string)=>accountIds.has(id)));members.add(String(owner.id));await tx`UPDATE nexusflow.records SET data=data||${tx.json({org_id:owner.org_id,member_ids:[...members]} as any)},updated_at=now() WHERE id=${String(row.id)} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;}
 for(const project of projects.values()){const current=project.data as any,ownerId=accountIds.has(String(current.owner_id))?String(current.owner_id):projectOwners.get(String(project.id))?.values().next().value||String(accounts.get(String(plan.people[0]!.username)).id),members=new Set<string>((Array.isArray(current.member_ids)?current.member_ids:[]).map(String).filter((id:string)=>accountIds.has(id)));members.add(ownerId);for(const id of projectOwners.get(String(project.id))||[])members.add(id);await tx`UPDATE nexusflow.records SET data=data||${tx.json({owner_id:ownerId,member_ids:[...members]} as any)},updated_at=now() WHERE id=${String(project.id)} AND kind='projects' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;}
 return {task_ids:taskRows.map(({row})=>String(row.id)),project_ids:[...projects.values()].map((row:any)=>String(row.id)),assignment_ids:assignmentIds};
}
function hasDemoRelationshipMigration(data:Record<string,any>,plan:ReturnType<typeof buildDemoSeed>){const migration=data.relationship_migration,projectCount=new Set(plan.tasks.map(task=>String(plan.projects[task.project_index]!.name))).size;return Array.isArray(migration?.task_ids)&&new Set(migration.task_ids).size===plan.tasks.length&&migration.task_ids.length===plan.tasks.length&&Array.isArray(migration?.assignment_ids)&&new Set(migration.assignment_ids).size===plan.tasks.length&&migration.assignment_ids.length===plan.tasks.length&&Array.isArray(migration?.project_ids)&&new Set(migration.project_ids).size===migration.project_ids.length&&migration.project_ids.length>=projectCount&&migration.project_ids.length<=plan.projects.length;}
// Fresh isolated creation only; no natural-key/name claim or repair path.
async function ensureSeedRecord(tx:any,user:ReturnType<typeof actor>,kind:any,seedKey:string,data:Record<string,unknown>,_match?:SeedMatch):Promise<string>{
 return insertRecord(tx,user,kind,{...data,seed_key:seedKey});
}
function demoSeedKeys(plan:ReturnType<typeof buildDemoSeed>){const keys:{kind:string;key:string}[]=[];
 for(const name of ["CNPC","研究院","智能技术中心","研发部","项目部","创新工作室"])keys.push({kind:"orgs",key:`org:${name}`});
 for(const person of plan.people)keys.push({kind:"people",key:`person:${person.username}`});
 for(const project of plan.projects)keys.push({kind:"projects",key:`project:${project.name}`});
 for(const task of plan.tasks){keys.push({kind:"tasks",key:`task:${task.name}`});keys.push({kind:"task_assignments",key:`assignment:${task.name}:${plan.people[task.owner_index]!.username}`});}
 keys.push({kind:"tasks",key:"task:demo-flow"},{kind:"task_assignments",key:"assignment:demo-flow"});
 plan.conflicts.forEach((_,i)=>keys.push({kind:"conflicts",key:`conflict:${i}`}));
 for(const tool of demoTools)keys.push({kind:"tools",key:`tool:${tool.id}`});
 keys.push({kind:"dispatch",key:"dispatch:demo-review"},{kind:"approvals",key:"approval:demo-review"});
 for(const key of ["inbox:seed-approval","inbox:seed-assignment","inbox:seed-mention","inbox:seed-system"])keys.push({kind:"inbox",key});
 keys.push({kind:"mentions",key:"mention:seed-demo"});
 return keys;}
async function seedKeysIntact(tx:any,user:ReturnType<typeof actor>,plan:ReturnType<typeof buildDemoSeed>){
 const keys=demoSeedKeys(plan),cache=new Map<string,Set<string>>();
 for(const {kind,key} of keys){
  if(!cache.has(kind)){const rows=await tx`SELECT id,data FROM nexusflow.records WHERE kind=${kind} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;cache.set(kind,new Set(rows.map((r:any)=>String(r.data?.seed_key||""))));}
  if(!cache.get(kind)!.has(key))return false;
 }
 return true;
}
async function demoAccountsExist(tx:any,user:ReturnType<typeof actor>,plan:ReturnType<typeof buildDemoSeed>){
 for(const person of plan.people){const rows=await tx`SELECT id FROM nexusflow.users WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND lower(username)=lower(${`demo.${person.username}`}) AND portal_id IS NULL AND status='active' LIMIT 1`;if(!rows.length)return false;}
 return true;
}
async function ensureDemoData(tx:any,user:ReturnType<typeof actor>,plan:ReturnType<typeof buildDemoSeed>){
 const orgTypes=["company","second_level","center","department","department","studio"],orgNames=["CNPC","研究院","智能技术中心","研发部","项目部","创新工作室"],orgIds:string[]=[];
 for(const [i,name] of orgNames.entries())orgIds.push(await ensureSeedRecord(tx,user,"orgs",`org:${name}`,{name,type:orgTypes[i],parent_id:i===0?null:i===1?orgIds[0]:i===2?orgIds[1]:orgIds[2],enabled:true},{name}));
 const accountIds:string[]=[];
 for(const person of plan.people){
  const orgId=orgIds[person.org_index]!,username=`demo.${person.username}`;
  const existing=await tx`SELECT id,portal_id FROM nexusflow.users WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND lower(username)=lower(${username}) LIMIT 1`;
  if(existing[0])throw new Error("forbidden: existing demo account cannot be claimed by username");
  const id=uid(),placeholderHash="";
  await tx`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role,tenant_id,org_id,status) VALUES(${id},${username},${placeholderHash},${person.name},${person.role},${user.tenant_id},${orgId},'active')`;
  accountIds.push(id);
 }
 const profileIds:string[]=[];
 for(const person of plan.people)profileIds.push(await ensureSeedRecord(tx,user,"people",`person:${person.username}`,{
  name:person.name,title:person.title,org_id:orgIds[person.org_index],user_id:accountIds[person.index],
  daily_standard_hours:8,status:"active",skills:person.skills,studio_ids:[orgIds[5]],department:person.org_index===3?"研发部":"项目部",
  projects:plan.projects.filter((_,i)=>(i+person.index)%3!==0).map(project=>project.name),
 },{name:String(person.name),userId:String(accountIds[person.index])}));
 const projectIds:string[]=[];
 for(const [i,project] of plan.projects.entries()){
  const owners=plan.tasks.filter(task=>task.project_index===i).map(task=>task.owner_index),members=[...new Set([owners[0]??i%accountIds.length,...owners])];
  projectIds.push(await ensureSeedRecord(tx,user,"projects",`project:${project.name}`,{...project,org_id:orgIds[2],owner_id:accountIds[members[0]!]!,member_ids:members.map(index=>accountIds[index]!)},{name:String(project.name)}));
 }
 const taskIds:string[]=[],assignmentIds:string[]=[];
 for(const task of plan.tasks){
  const owner=accountIds[task.owner_index]!,id=await ensureSeedRecord(tx,user,"tasks",`task:${task.name}`,{
   ...task,org_id:orgIds[plan.people[task.owner_index]!.org_index],
   project_id:projectIds[task.project_index],owner_id:owner,member_ids:[owner],
  },{name:String(task.name)});
  taskIds.push(id);
  assignmentIds.push(await ensureSeedRecord(tx,user,"task_assignments",`assignment:${task.name}:${plan.people[task.owner_index]!.username}`,{
   task_id:id,user_id:owner,start_date:task.start_date,end_date:task.end_date,daily_hours:task.daily_hours,
   all_day:task.all_day,status:task.status==="done"?"accepted":task.status==="draft"?"assigned":"active",progress:task.progress,deliverables:[],
  },{taskId:id,userId:owner}));
 }
 const flowTask=await ensureSeedRecord(tx,user,"tasks","task:demo-flow",{
  name:"跨部门派发审批演示",type:"market",status:"draft",org_id:orgIds[3],project_id:projectIds[0],
  owner_id:user.id,member_ids:[user.id],daily_hours:1,all_day:false,start_date:plan.tasks[0]!.start_date,
  end_date:plan.tasks[0]!.end_date,summary:"可直接用于演示任务派发与审批闭环",
 },{name:"跨部门派发审批演示"});
 await ensureSeedRecord(tx,user,"task_assignments","assignment:demo-flow",{task_id:flowTask,user_id:user.id,start_date:plan.tasks[0]!.start_date,end_date:plan.tasks[0]!.end_date,daily_hours:1,all_day:false,status:"assigned",progress:0,deliverables:[]},{taskId:flowTask,userId:user.id});
 for(const [index,item] of plan.conflicts.entries())await ensureSeedRecord(tx,user,"conflicts",`conflict:${index}`,{
  task_id:taskIds[item.task_index],person_id:accountIds[item.person_index],type:item.type,severity:item.severity,
  title:item.title,status:"open",reported_by:user.id,reported_at:new Date().toISOString(),
 },{taskId:taskIds[item.task_index],personId:accountIds[item.person_index],type:item.type});
 for(const tool of demoTools)await ensureSeedRecord(tx,user,"tools",`tool:${tool.id}`,tool as any,{toolId:String(tool.id)});
 const reviewTask=taskIds[5]!,targetOrg=orgIds[plan.people[plan.tasks[5]!.owner_index]!.org_index],approver=accountIds[2]!;
 await tx`UPDATE nexusflow.records SET data=data||${tx.json({status:"pending_coordination"} as any)},updated_at=now() WHERE id=${reviewTask} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;
 const demoDispatch=await ensureSeedRecord(tx,user,"dispatch","dispatch:demo-review",{task_id:reviewTask,requester_id:user.id,workflow:"standard",status:"pending_approval",target_org_ids:[targetOrg]},{taskId:reviewTask});
 const approvalId=await ensureSeedRecord(tx,user,"approvals","approval:demo-review",{dispatch_id:demoDispatch,task_id:reviewTask,target_org_id:targetOrg,step:"department_director",approver_id:approver,status:"pending"},{dispatchId:demoDispatch,step:"department_director"});
 await ensureSeedRecord(tx,user,"inbox","inbox:seed-approval",{user_id:approver,type:"approval",title:"管道完整性管理·项目立项审批",source_id:approvalId,status:"pending",read_at:null,project_id:projectIds[1],sender:"王建国"},{userId:approver,type:"approval"});
 await ensureSeedRecord(tx,user,"inbox","inbox:seed-assignment",{user_id:accountIds[4],type:"assignment",title:"数据中台迁移演练·你被指定为成员",source_id:taskIds[4],status:"pending",read_at:null,sender:"张伟"},{userId:accountIds[4],type:"assignment"});
 await ensureSeedRecord(tx,user,"mentions","mention:seed-demo",{user_id:accountIds[4],source_id:taskIds[1],type:"task_update",text:"刘洋在联调用例评审中提到了你"},{userId:accountIds[4],sourceId:taskIds[1]});
 await ensureSeedRecord(tx,user,"inbox","inbox:seed-mention",{user_id:accountIds[4],type:"mention",title:"刘洋在联调用例评审中提到了你",source_id:taskIds[1],status:"pending",read_at:null},{userId:accountIds[4],type:"mention"});
 await ensureSeedRecord(tx,user,"inbox","inbox:seed-system",{user_id:user.id,type:"system",title:"演示数据已就绪",status:"pending",read_at:null},{userId:user.id,type:"system"});
 return {orgIds,accountIds,profileIds,projectIds,taskIds,assignmentIds,flowTask,reviewTask};
}
export async function seedDemo(user:ReturnType<typeof actor>){assertSeedAllowed(user);return seedDemoInner(user);}
// Legacy repair helpers above are retained, but are not authorized to migrate unproven data.
export async function seedDemoInner(user:ReturnType<typeof actor>){
 assertSeedAllowed(user);
 if(!sql)throw new Error("DATABASE_URL required");
 const plan=buildDemoSeed();
 return sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`nexusflow-seed:${user.tenant_id||"default"}`}))`;
  const old=await tx`SELECT id,created_by,created_at,data,xmin::text AS seed_xid FROM nexusflow.records WHERE kind='seed' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} LIMIT 1`;
  const markerData=(old[0]?.data||{}) as Record<string,any>,version=Number(markerData.version||0);
  // Pending trusted-provenance migration: reject legacy repair, never infer ownership by name/graph.
  if(old.length){
   if(version!==4||markerData.provenance!=="isolated-demo-v1"||!hasDemoRelationshipMigration(markerData,plan)||!Array.isArray(markerData.account_ids)||!await seedKeysIntact(tx,user,plan)||!await demoAccountsExist(tx,user,plan))throw new Error("forbidden: seed repair pending trusted provenance migration");
   const accounts=await tx`SELECT id FROM nexusflow.users WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND username LIKE 'demo.%'`;
   if(accounts.length!==plan.people.length||accounts.some((row:any)=>!markerData.account_ids.includes(String(row.id))))throw new Error("forbidden: demo account provenance mismatch");
   const credentials=await issueDemoCredentials(tx,plan.people,user.tenant_id);
   await addAudit(tx,user,"seed.credentials_rotate","seed",String(old[0].id),{reason:"explicit isolated demo seed request"});
   return {ok:true,already_seeded:true,credentials};
  }
  const candidates=await tx`SELECT id FROM nexusflow.records WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND kind IN ('orgs','people','projects','tasks','task_assignments','tools','dispatch','approvals','conflicts','seed') LIMIT 1`;
  const accounts=await tx`SELECT id FROM nexusflow.users WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND username LIKE 'demo.%' LIMIT 1`;
  if(candidates.length||accounts.length)throw new Error("forbidden: seed creation requires an empty isolated business tenant");
  const ensured=await ensureDemoData(tx,user,plan),credentials=await issueDemoCredentials(tx,plan.people,user.tenant_id);
  const marker={provenance:"isolated-demo-v1",account_ids:ensured.accountIds,seeded_at:new Date().toISOString(),version:4,relationship_migration:{from_version:version,at:new Date().toISOString(),task_ids:ensured.taskIds,project_ids:ensured.projectIds,assignment_ids:ensured.assignmentIds}};
  await insertRecord(tx,user,"seed",marker);
  await addAudit(tx,user,"seed.demo","project",ensured.projectIds[0]!,{people:ensured.profileIds.length,tasks:ensured.taskIds.length+1,projects:ensured.projectIds.length,tools:demoTools.length});
  return {ok:true,already_seeded:version>=4,organizations:ensured.orgIds.length,people:ensured.profileIds.length,projects:ensured.projectIds.length,tasks:ensured.taskIds.length+1,conflicts:plan.conflicts.length,tools:demoTools.length,dispatch_task_id:ensured.flowTask,related:true,credentials};
 });
}
