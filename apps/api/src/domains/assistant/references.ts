import { accountFields,type ToolSpec } from './catalog.ts';
import { BusinessApiError,callApi,type Runtime } from './transport.ts';
import { activeUsers } from '../people/service.ts';

// 只处理工具契约声明的账号引用；配置、说明和嵌套业务数据不能按字段名猜测改写。
export async function normalizeReferences(runtime:Runtime,spec:ToolSpec,input:Record<string,any>){
 const args=structuredClone(input),resolved=new Map<string,string>();
 async function account(id:unknown):Promise<string>{
  if(typeof id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(id))throw Error('invalid account reference: 请使用查询返回的账号 user_id');
  if(id===runtime.user.id)return id;
  if(resolved.has(id))return resolved.get(id)!;
  let person:any;
  try{person=await callApi(runtime,{path:`/api/people/${encodeURIComponent(id)}`});}
  catch(error){if(!(error instanceof BusinessApiError)||![403,404].includes(error.status))throw error;}
  if(person&&!person.user_id)throw Error('invalid account reference: 该人员档案未绑定登录账号，不能作为负责人、成员或授权对象');
  const result=person?String(person.user_id):id;resolved.set(id,result);return result;
 }
 const assignees:string[]=[];
 for(const field of accountFields(spec)){
  const [group,key]=field.split('.'),object=key?args[group!]:args,name=key||group!;
  if(!object||object[name]===undefined)continue;
  if(group==='data'&&name==='member_ids'){
   if(!Array.isArray(object[name]))throw Error('invalid member_ids: 必须为账号 ID 数组');
   object[name]=[...new Set(await Promise.all(object[name].map(account)))];assignees.push(...object[name]);
  }else if(group==='query'&&name!=='subject_id'){
   if(typeof object[name]!=='string')throw Error('invalid account query');
   object[name]=[...new Set(await Promise.all(object[name].split(',').map(account)))].join(',');
  }else{
   object[name]=await account(object[name]);
   if(group==='data'&&name!=='subject_id')assignees.push(object[name]);
  }
 }
 // 在产生确认卡之前发现无效、停用或跨租户账号；提交时仍走原 API 再次校验。
 if(assignees.length)await activeUsers(runtime.user,assignees);
 return args;
}
