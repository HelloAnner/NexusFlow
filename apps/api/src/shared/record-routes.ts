import type { Handler } from "hono";
import type { ApiApp,ApiEnv } from "./http.ts";
import { actor } from "../permissions.ts";
import { listRecords,getRecord,createRecord,updateRecord,deleteRecord,type Collection } from "../records.ts";
import { listDto } from "../../../../packages/shared/src/contracts.ts";
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
  const q=(c.req.query("q")||"").toLowerCase();
  return c.json(listDto(q?items.filter(x=>JSON.stringify(x).toLowerCase().includes(q)):items,c.req.query()));
 });
 app.post(path,async c=>{if(kind==="files")return c.json({error:"use multipart /api/files/upload"},405);const body=await c.req.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body))return c.json({error:"JSON object required"},400);return c.json(await createRecord(actor(c),kind,body),201);});
 app.get(`${path}/:id`,async c=>{const item=await getRecord(actor(c),kind,c.req.param("id"));return item?c.json(item):c.json({error:"not found"},404);});
 app.patch(`${path}/:id`,async c=>{const body=await c.req.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body))return c.json({error:"JSON object required"},400);try{const result=await updateRecord(actor(c),kind,c.req.param("id"),body);return result?c.json(result):c.json({error:"not found"},404);}catch(error){if(error instanceof Error&&error.message==="approval identity fields are managed by account roles")return c.json({error:error.message},400);throw error;}});
 app.delete(`${path}/:id`,async c=>{if(!await deleteRecord(actor(c),kind,c.req.param("id")))return c.json({error:"not found or forbidden"},404);return c.json({ok:true});});
}
}
