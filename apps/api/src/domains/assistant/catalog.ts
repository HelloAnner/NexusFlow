import { allowedAction,canManage,featureDenied,type User } from "../../permissions.ts";
import { portalAllows } from "../../auth.ts";
import type { Call } from "./transport.ts";
export type ToolSpec={name:string;label:string;domain:string;method:string;path:string;description:string;action?:string;read?:string;manager?:boolean;data?:boolean;custom?:string};
export const toolSpecs:ToolSpec[]=[];
function add(name:string,label:string,domain:string,method:string,path:string,description=label,extra:Partial<ToolSpec>={}){toolSpecs.push({name,label,domain,method,path,description,...extra});}
const collections=[['orgs','部门'],['people','人员'],['projects','项目'],['tasks','任务'],['task_assignments','分工'],['dispatch','派发'],['approvals','审批'],['files','资料'],['inbox','待办'],['config','配置'],['tools','业务工具台'],['invitations','邀请'],['visibility_grants','项目授权'],['worklogs','工时'],['milestones','里程碑']] as const;
const writable=new Set(['orgs','people','projects','tasks','dispatch','config','tools','visibility_grants','milestones']);
for(const [kind,label] of collections){
 add(`${kind}_list`,`查询${label}`,kind,'GET',`/api/${kind}`,`按 q、日期、状态等 query 筛选${label}；返回真实数据，分页使用 page/page_size。先查名称获得真实 id，禁止猜 id。`);
 add(`${kind}_get`,`读取${label}详情`,kind,'GET',`/api/${kind}/:id`);
 if(writable.has(kind)){
  const fields=kind==='tasks'?'必填 name,type,owner_id,start_date,end_date,daily_hours；可选 project_id,org_id,member_ids,all_day,estimated_hours,summary。type 先查询配置或现有任务。':kind==='projects'?'必填 name,owner_id,org_id；可选 member_ids,visibility。':kind==='orgs'?'必填 name,type；type 为 company/second_level/center/department/studio，可选 parent_id,enabled。':kind==='people'?'必填 name,org_id；可选 user_id,status,daily_standard_hours,skills。':kind==='dispatch'?'必填 task_id,requester_id,workflow(standard/supplemental),target_org_ids。':kind==='config'?'key 为 task_types 时 value={types:[类型编码]}；key 为 work_calendar 时 value={weekdays:[1,2,3,4,5],holidays:[日期],extra_workdays:[日期]}。':'data 必须遵守当前业务字段契约。';
  add(`${kind}_create`,`创建${label}`,kind,'POST',`/api/${kind}`,`创建${label}草稿。${fields}`,{data:true});
  add(`${kind}_update`,`编辑${label}`,kind,'PATCH',`/api/${kind}/:id`,`编辑${label}基础字段；状态、日期、成员变动必须走专门业务动作，不得改服务端字段。`,{data:true,read:`/api/${kind}/:id`});
 }
}
for(const [kind,label,actions] of [
 ['projects','项目',['start','pause','resume','complete','archive','restore']],
 ['tasks','任务',['confirm','reschedule','report','submit_acceptance','accept','return','archive','pause','resume','cancel']],
 ['task_assignments','分工',['confirm','report','submit','set_deliverables','reschedule','accept','return','change_member','cancel']],
] as [string,string,string[]][]){for(const action of actions)add(`${kind}_${action}`,`${label}${({start:'启动',pause:'暂停',resume:'恢复',complete:'完成',archive:'归档',restore:'恢复档案',confirm:'确认',reschedule:'调整排期或延期',report:'填报进度工时',submit_acceptance:'提交验收',accept:'验收通过',return:'退回',submit:'提交成果',set_deliverables:'设置成果要求',cancel:'取消',change_member:'更换成员'} as any)[action]}`,kind,'POST',`/api/${kind}/:id/action`,`data 参数：${action==='reschedule'?'start_date,end_date,daily_hours,all_day,reason；调整前先调用 schedule_preview。':action==='report'?'progress(0..100),hours(0..24),note；分工可传 date(YYYY-MM-DD)。':action==='submit'?'result,file_ids。':action==='set_deliverables'?'deliverables 为资料类别数组。':action==='change_member'?'user_id,reason。':'reason 为操作原因。'}`,{action,data:true,read:`/api/${kind}/:id`});}
for(const [name,label,domain,method,path,read] of [
 ['orgs_delete','删除无引用部门','orgs','DELETE','/api/orgs/:id','/api/orgs/:id'],
 ['tasks_publish','发布任务','tasks','POST','/api/tasks/:id/publish','/api/tasks/:id'],
 ['tasks_assignments','查询任务分工','tasks','GET','/api/tasks/:id/assignments',''],
 ['tasks_assign','添加任务分工','task_assignments','POST','/api/tasks/:id/assignments','/api/tasks/:id'],
 ['dispatch_submit','提交派发协调','dispatch','POST','/api/dispatch/:id/submit','/api/dispatch/:id'],
 ['dispatch_confirm','确认后补派发','dispatch','POST','/api/dispatch/:id/confirm','/api/dispatch/:id'],
 ['approvals_decision','审批同意或拒绝','approvals','POST','/api/approvals/:id/decision','/api/approvals/:id'],
 ['conflicts_list','查询排期冲突','conflicts','GET','/api/conflicts',''],
 ['conflicts_get','读取冲突详情','conflicts','GET','/api/conflicts/:id',''],
 ['conflicts_resolve','确认冲突已解决','conflicts','POST','/api/conflicts/:id/resolve','/api/conflicts/:id'],
 ['conflicts_force','限期强制协调冲突','conflicts','POST','/api/conflicts/:id/force','/api/conflicts/:id'],
 ['files_versions','查询文件版本','files','GET','/api/files/:id/versions',''],
 ['files_rollback','回滚文件形成新版本','files','POST','/api/files/:id/rollback','/api/files/:id'],
 ['files_archive','归档文件','files','POST','/api/files/:id/archive','/api/files/:id'],
 ['inbox_read','标记待办已读','inbox','POST','/api/inbox/:id/read','/api/inbox/:id'],
 ['inbox_complete','完成待办','inbox','POST','/api/inbox/:id/complete','/api/inbox/:id'],
 ['config_versions','查询配置版本','config','GET','/api/config/:id/versions',''],
 ['config_publish','发布配置','config','POST','/api/config/:id/publish','/api/config/:id'],
 ['config_delete','删除配置草稿','config','DELETE','/api/config/:id','/api/config/:id'],
 ['invitations_create','创建人员邀请','invitations','POST','/api/invitations',''],
 ['invitations_revoke','撤销邀请','invitations','POST','/api/invitations/:id/revoke','/api/invitations/:id'],
 ['visibility_grants_revoke','撤销项目授权','visibility_grants','POST','/api/visibility_grants/:id/revoke','/api/visibility_grants/:id'],
 ['orgs_tree','查询组织树','orgs','GET','/api/orgs/tree',''],
 ['home_overview','查询当前工作台','tasks','GET','/api/home',''],
 ['gantt_list','查询甘特计划','tasks','GET','/api/gantt',''],
 ['gantt_summary','查询计划摘要','tasks','GET','/api/gantt/summary',''],
 ['load_list','查询团队负载','people','GET','/api/load',''],
 ['load_person','查询人员当日负载','people','GET','/api/load/:id',''],
 ['reports_get','查询业务报表','reports','GET','/api/reports/:id',''],
 ['reports_export','生成业务报表快照','reports','POST','/api/reports/:id/export',''],
 ['auth_me','查询我的身份','tasks','GET','/api/auth/me',''],
 ['auth_profile','修改我的显示名称','people','PATCH','/api/auth/me','/api/auth/me'],
 ['admin_users','查询账号人员完整档案','people','GET','/api/admin/users',''],
 ['admin_audit','查询业务审计','admin','GET','/api/admin/audit',''],
 ['admin_preflight','检查系统状态','admin','GET','/api/admin/preflight',''],
 ['admin_profile','调整人员档案与部门等级可派发状态','people','PATCH','/api/admin/users/:id/profile','/api/admin/users'],
 ['admin_binding','调整人员角色与主部门','people','PATCH','/api/admin/users/:id/binding','/api/admin/users'],
 ['admin_status','启停或锁定账号','people','PATCH','/api/admin/users/:id/status','/api/admin/users'],
 ['admin_delegations','调整副职分管组织','people','PUT','/api/admin/users/:id/delegations','/api/admin/users'],
 ['admin_projects','查询人员项目归属','people','GET','/api/admin/users/:id/projects',''],
 ['admin_project_set','调整人员项目归属职责','people','PUT','/api/admin/users/:id/projects/:secondary','/api/admin/users/:id/projects'],
 ['admin_project_remove','移除人员项目归属','people','DELETE','/api/admin/users/:id/projects/:secondary','/api/admin/users/:id/projects'],
 ['permission_catalog','查询权限实体目录','admin','GET','/api/v1/rbac/catalog',''],
 ['permission_subjects','查询权限人员','admin','GET','/api/v1/rbac/subjects',''],
 ['permission_matrix','检查有效权限和来源','admin','GET','/api/v1/rbac/matrix',''],
 ['permission_set','授权撤权或重置单项权限','admin','PUT','/api/v1/rbac/matrix','/api/v1/rbac/matrix'],
 ['permission_reset','恢复人员默认权限','admin','DELETE','/api/v1/rbac/matrix','/api/v1/rbac/matrix'],
 ['permission_prune','清理失效项目授权','admin','POST','/api/v1/rbac/prune','/api/v1/rbac/subjects'],
] as string[][])add(name,label,domain,method,path,`${label}。${name.startsWith('permission_')?'权限矩阵查询传 query.subject_id；写入 data={subject_id,type,id,action,effect}，effect 为 allow/deny/null；重置人员传 query.subject_id。':name==='admin_profile'?'data 支持 display_name,org_ids,management_level,professional_level,duties,skills,studio_ids,work_status,dispatchable,daily_standard_hours。':name==='reports_get'||name==='reports_export'?'id 是 task-overview/people-load/files/conflicts/projects，query.from/to 为日期。':name==='approvals_decision'?'data={approved:布尔值,reason:意见}。':name==='tasks_assign'?'data={user_id,start_date,end_date,daily_hours,all_day,deliverables}。':'操作字段放 data，筛选参数放 query。'}`,{read:read||undefined,data:method!=='GET',manager:name.startsWith('admin_')||name.startsWith('permission_')});
add('action_status','查询自己操作卡的实际执行状态','tasks','GET','/api/ai/actions/:id','只能读取当前用户自己的操作回执，不能代用户确认。');
add('tools_delete','删除业务工具入口','tools','DELETE','/api/tools/:id','删除已配置业务工具入口。',{read:'/api/tools/:id'});
add('files_attach','将附件归入任务或项目资料','files','POST','/api/planning/files/:id/attach','id 为当前用户已上传文件；data={task_id 或 project_id,category,scope:space}。复用真实上传与成果权限。',{data:true,read:'/api/files/:id'});
add('worklogs_confirm','确认已填报工时','tasks','POST','/api/worklogs/:id/confirm','确认任务工时后才纳入完工预测。',{read:'/api/worklogs/:id'});
add('milestones_delete','删除里程碑','milestones','DELETE','/api/milestones/:id','删除当前有权编辑任务下的里程碑。',{read:'/api/milestones/:id'});
add('task_types','查询可用任务类型','tasks','GET','/api/planning/task-types','创建任务之前读取当前租户已发布的任务类型编码。');
add('portal_file_links','查询文件身份关联','admin','GET','/api/admin/portal-file-links','管理员检查门户文件身份关联。',{manager:true});
add('portal_file_links_set','维护文件身份关联','admin','PUT','/api/admin/portal-file-links','管理员维护门户身份与本地账号关联，操作字段放 data。',{manager:true,data:true,read:'/api/admin/portal-file-links'});
add('my_work','查询我的任务分工待办与未来风险','tasks','GET','/api/planning/mine','query.from/to 日期范围，默认今天起两周。');
add('schedule_calendar','查询区间容量和排期','tasks','GET','/api/planning/calendar','query.from/to,person_id；包括真实分工、正式占用和预估占用。');
add('schedule_forecast','计算任务完工风险','tasks','GET','/api/planning/forecast/:id','id 为任务 id；缺少预计工时或容量返回未知，不推测确定日期。');
add('schedule_preview','预检调期的影响与冲突','tasks','POST','/api/planning/preview/:id','只读预检，不产生业务修改。data={start_date,end_date,daily_hours,all_day}。',{data:true,custom:'preview'});
add('files_read','读取有权限的文件文本','files','GET','/api/planning/files/:id/text','支持 UTF-8 文本和 Office 文档的文本读取。');
add('files_download','获取文件下载入口','files','GET','/api/files/:id','返回文件信息和受鉴权的下载入口，不能绕过权限。',{custom:'download'});
export function toolAvailable(user:User,spec:ToolSpec){
 const read=spec.method==='GET'||spec.custom==='preview';
 if(['orgs_create','orgs_delete','admin_binding','admin_status','admin_delegations','config_publish','conflicts_force'].includes(spec.name)&&!['super_admin','center_director'].includes(user.role))return false;
 if(spec.name==='auth_profile')return portalAllows(user,'/api/auth/me','PATCH');
 if(spec.manager&&!canManage(user))return false;
 if(!allowedAction(user,spec.domain,read?'read':'write'))return false;
 if(spec.domain==='admin'&&featureDenied(user,spec.name==='admin_audit'?'audit':'people',spec.name==='admin_audit'?'view':'manage'))return false;
 const path=spec.path.replace(/:[a-z]+/g,'object');return portalAllows(user,path,spec.method);
}
const identifier={type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9_.:-]+$'};
export function parameters(spec:ToolSpec){return {type:'object',properties:{...(spec.path.includes(':id')?{id:identifier}:{}),...(spec.path.includes(':secondary')?{secondary:identifier}:{}),query:{type:'object',description:'筛选条件，仅字符串值，例如 from,to,person_id,status,q,page,page_size,subject_id',additionalProperties:{type:'string'}},...(spec.data?{data:{type:'object',description:spec.description,additionalProperties:true}}:{})},required:[...(spec.path.includes(':id')?['id']:[]),...(spec.path.includes(':secondary')?['secondary']:[]),...(spec.data?['data']:[])],additionalProperties:false};}
export function makeCall(spec:ToolSpec,args:Record<string,any>):Call{
 for(const key of Object.keys(args))if(!['id','secondary','query','data'].includes(key))throw Error('invalid tool argument');
 for(const key of ['id','secondary'])if(spec.path.includes(`:${key}`)&&(typeof args[key]!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(args[key])))throw Error('invalid object id');
 if(args.query&&(Array.isArray(args.query)||typeof args.query!=='object'||Object.values(args.query).some(v=>typeof v!=='string')))throw Error('invalid query');
 if(spec.data&&(!args.data||Array.isArray(args.data)||typeof args.data!=='object'))throw Error('data object required');
 if(JSON.stringify(args).length>32000)throw Error('invalid tool argument size');
 const pending:[unknown,number][]=[[args,0]];while(pending.length){const [value,depth]=pending.pop()!;if(depth>8)throw Error('invalid nested tool argument');if(value&&typeof value==='object')for(const child of Object.values(value))pending.push([child,depth+1]);}
 let path=spec.path.replace(':id',encodeURIComponent(args.id||'')).replace(':secondary',encodeURIComponent(args.secondary||''));
 const query=new URLSearchParams(args.query||{});if(spec.method==='GET'&&path.match(/^\/api\/(orgs|people|projects|tasks|task_assignments|files|inbox|tools|dispatch|approvals|config|invitations|visibility_grants|worklogs|milestones)$/)&&!query.has('page_size'))query.set('page_size','50');
 if(query.size)path+=`?${query}`;
 return {path,method:spec.method,...(spec.data?{body:{...args.data,...(spec.action?{action:spec.action}:{})}}:{})};
}
