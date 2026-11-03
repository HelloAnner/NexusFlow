import { expect,test,mock,beforeEach } from 'bun:test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../src/domains/assistant/',import.meta.url));
let rows:any[]=[],reads:string[]=[],current:Record<string,any>={};
mock.module(root+'repository.ts',()=>({db:()=>async(sql:TemplateStringsArray,...values:any[])=>{
 expect(sql.join('')).toContain("status='succeeded'");expect(values).toEqual(['conversation','tenant','user']);return rows;
}}));
mock.module(root+'transport.ts',()=>({callApi:async(_runtime:any,call:any)=>{reads.push(call.path);if(!current[call.path])throw Error('forbidden');return current[call.path];}}));
const { recentActionContext }=await import('../src/domains/assistant/context');
const runtime=()=>({conversationId:'conversation',user:{id:'user',username:'me',tenant_id:'tenant',org_id:'org',role:'center_director',portal_permissions:null},signal:new AbortController().signal}) as any;
beforeEach(()=>{rows=[];reads=[];current={};});
test('confirmed creates survive aggregate-history invalidation using only freshly authorized object identity',async()=>{
 rows=[{id:'receipt',data:{tool:'projects_create',args:{data:{name:'old secret'}},before:{private:'secret'},result:{response:{id:'project',name:'old secret',token:'secret'}}}}];
 current['/api/projects/project']={id:'project',name:'当前项目名',status:'planning',private:'not context'};
 expect(await recentActionContext(runtime())).toEqual([{action_id:'receipt',tool:'projects_create',status:'succeeded',object:{id:'project',name:'当前项目名',status:'planning'}}]);
 expect(reads).toEqual(['/api/projects/project']);
});
test('revoked, deleted, invalid and privileged objects cannot leak through operation context',async()=>{
 rows=[{id:'revoked',data:{tool:'projects_create',result:{response:{id:'hidden',name:'secret'}}}},{id:'bad',data:{tool:'projects_create',result:{response:{id:'../escape'}}}},{id:'admin',data:{tool:'admin_status',args:{id:'secret-user'}}}];
 expect(await recentActionContext(runtime())).toEqual([]);expect(reads).toEqual(['/api/projects/hidden']);
});
test('wrapped task results use their real object ID and cancellation is propagated',async()=>{
 rows=[{id:'receipt',data:{tool:'tasks_publish',args:{id:'task'},result:{response:{task:{id:'task'}}}}}];
 current['/api/tasks/task']={id:'task',name:'任务',status:'in_progress'};
 expect((await recentActionContext(runtime()))[0]?.object.id).toBe('task');
 const rt=runtime();rt.signal=AbortSignal.abort();current={};await expect(recentActionContext(rt)).rejects.toThrow();
});
