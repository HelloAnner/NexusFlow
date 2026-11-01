import type { Handler } from "hono";
import type { ApiApp,ApiEnv } from "./http.ts";
import { actor } from "../permissions.ts";
import { listRecords,getRecord,createRecord,updateRecord,deleteRecord,type Collection } from "../records.ts";
import { listDto } from "../../../../packages/shared/src/contracts.ts";
import { validDate } from '../load.ts';
export function registerRecordRoutes(app:ApiApp,kinds:readonly Collection[],loadHandler?:Handler<ApiEnv>){
for(const kind of kinds){
 const path=`/api/${kind}`;
 app.get(path,kind==="load"&&loadHandler?loadHandler:async c=>{
  let items=await listRecords(actor(c),kind);
  const requestedScope=c.req.query("scope");
  if(kind==="files"){
   // NexusFlow 既有的 access_scope 语义与统一的 personal/space 一一对应：
   //   uploader = 仅上传者可见（personal）
   //   其余     = 项目/租户内按既有规则共享（space）
   // 这里只做投影与过滤，不改动 canReadRecord 已经保证的可见性。
   if(requestedScope!==undefined&&requestedScope!=="personal"&&requestedScope!=="space")return c.json({error:"invalid scope"},400);
   items=items.map(x=>({...x,scope:x.access_scope==="uploader"?"personal":"space"}));
   if(requestedScope)items=items.filter(x=>x.scope===requestedScope);
  }
  const query=c.req.query(),q=(query.q||'').toLowerCase();
  for(const key of ['status','owner_id','user_id','person_id','task_id','project_id','org_id','type','category','enabled','dispatchable'])if(query[key]){const values=query[key]!.split(',');items=items.filter(item=>values.includes(String(item[key]??'')));}
  if(query.mine==='true'){const id=actor(c).id;items=items.filter(item=>item.owner_id===id||item.user_id===id||item.person_id===id||Array.isArray(item.member_ids)&&item.member_ids.includes(id));}
  if(query.from&&!validDate(query.from)||query.to&&!validDate(query.to)||query.from&&query.to&&query.from>query.to)return c.json({error:'invalid date range'},400);
  if(query.from)items=items.filter(item=>String(item.end_date||item.date||(item.created_at instanceof Date?item.created_at.toISOString():item.created_at)||'').slice(0,10)>=query.from!);
  if(query.to)items=items.filter(item=>String(item.start_date||item.date||(item.created_at instanceof Date?item.created_at.toISOString():item.created_at)||'').slice(0,10)<=query.to!);
  if(query.sort){if(!['name','start_date','end_date','created_at','updated_at'].includes(query.sort))return c.json({error:'invalid sort field'},400);const key=query.sort,direction=query.direction==='desc'?-1:1;items.sort((a,b)=>direction*String(a[key]||'').localeCompare(String(b[key]||'')));}
  return c.json(listDto(q?items.filter(x=>JSON.stringify(x).toLowerCase().includes(q)):items,query));
 });
 app.post(path,async c=>{if(kind==="files")return c.json({error:"use multipart /api/files/upload"},405);const body=await c.req.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body))return c.json({error:"JSON object required"},400);return c.json(await createRecord(actor(c),kind,body),201);});
 app.get(`${path}/:id`,async c=>{const item=await getRecord(actor(c),kind,c.req.param("id"));return item?c.json(item):c.json({error:"not found"},404);});
 app.patch(`${path}/:id`,async c=>{const body=await c.req.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body))return c.json({error:"JSON object required"},400);try{const result=await updateRecord(actor(c),kind,c.req.param("id"),body,c.req.header('if-match'));return result?c.json(result):c.json({error:"not found"},404);}catch(error){if(error instanceof Error&&error.message==="approval identity fields are managed by account roles")return c.json({error:error.message},400);throw error;}});
 app.delete(`${path}/:id`,async c=>{if(!await deleteRecord(actor(c),kind,c.req.param("id")))return c.json({error:"not found or forbidden"},404);return c.json({ok:true});});
}
}
