import { expect,test,mock,beforeEach } from 'bun:test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../src/domains/',import.meta.url));
class BusinessApiError extends Error {constructor(message:string,readonly status:number){super(message);}}
const profiles:Record<string,any>={'person-a':{user_id:'account-a'},'person-b':{user_id:'account-b'},'person-disabled':{user_id:'disabled'},unlinked:{name:'未绑定'}};
const checked:string[][]=[];let reads:string[]=[];let failure=0;
mock.module(root+'assistant/transport.ts',()=>({BusinessApiError,callApi:async(_runtime:any,call:any)=>{
 reads.push(call.path);if(failure)throw new BusinessApiError('business failure',failure);
 const person=profiles[decodeURIComponent(call.path.split('/').at(-1))];if(!person)throw new BusinessApiError('not found',404);return person;
}}));
mock.module(root+'people/service.ts',()=>({activeUsers:async(_user:any,ids:string[])=>{
 checked.push(ids);if(ids.some(id=>!['current','account-a','account-b'].includes(id)))throw Error('active same-tenant user required');return ids.map(id=>({id}));
}}));
const { normalizeReferences }=await import('../src/domains/assistant/references');
const { toolSpecs,accountFields,parameters,toolAvailable,makeCall }=await import('../src/domains/assistant/catalog');
const spec=(name:string)=>toolSpecs.find(t=>t.name===name)!;
const runtime:any={user:{id:'current',tenant_id:'tenant'}};
beforeEach(()=>{checked.length=0;reads=[];failure=0;});

test('project and task assignees use linked accounts, preserve input, and deduplicate mixed IDs',async()=>{
 for(const name of ['projects_create','projects_update','tasks_create']){
  const input={data:{owner_id:'person-a',member_ids:['person-b','account-b','person-b']}};
  const result=await normalizeReferences(runtime,spec(name),input);
  expect(result.data).toEqual({owner_id:'account-a',member_ids:['account-b']});
  expect(input.data.owner_id).toBe('person-a');expect(checked.at(-1)).toEqual(['account-a','account-b']);
 }
});
test('assignment, dispatch, grants and people bindings share the same reference contract',async()=>{
 for(const [name,key] of [['tasks_assign','user_id'],['task_assignments_change_member','user_id'],['dispatch_create','requester_id'],['visibility_grants_create','user_id'],['people_create','user_id']]){
  expect((await normalizeReferences(runtime,spec(name!),{data:{[key!]:'person-a'}})).data[key!]).toBe('account-a');
 }
});
test('admin paths and permission subjects normalize without altering project or feature IDs',async()=>{
 expect(await normalizeReferences(runtime,spec('admin_project_set'),{id:'person-a',secondary:'project',data:{project_role:'core'}})).toMatchObject({id:'account-a',secondary:'project'});
 expect(await normalizeReferences(runtime,spec('permission_set'),{data:{subject_id:'person-a',type:'project',id:'person-b',action:'view',effect:'deny'}})).toMatchObject({data:{subject_id:'account-a',id:'person-b'}});
 expect(await normalizeReferences(runtime,spec('permission_reset'),{query:{subject_id:'person-a'}})).toEqual({query:{subject_id:'account-a'}});
 expect(checked).toEqual([]);
});
test('queries normalize account filters including comma-separated IDs and worklog person_id',async()=>{
 expect(await normalizeReferences(runtime,spec('tasks_list'),{query:{owner_id:'person-a,person-b,account-a',q:'person-a'}})).toEqual({query:{owner_id:'account-a,account-b',q:'person-a'}});
 expect(await normalizeReferences(runtime,spec('worklogs_list'),{query:{person_id:'person-a'}})).toEqual({query:{person_id:'account-a'}});
});
test('unlinked, disabled and foreign identities fail before an action can be proposed',async()=>{
 for(const id of ['unlinked','person-disabled','foreign'])await expect(normalizeReferences(runtime,spec('projects_create'),{data:{owner_id:id}})).rejects.toThrow();
 await expect(normalizeReferences(runtime,spec('tasks_create'),{data:{member_ids:'person-a'}})).rejects.toThrow('invalid member_ids');
 await expect(normalizeReferences(runtime,spec('projects_create'),{data:{owner_id:123}})).rejects.toThrow('invalid account reference');
});
test('disabled accounts remain manageable and opaque config data is never rewritten',async()=>{
 expect(await normalizeReferences(runtime,spec('admin_status'),{id:'person-disabled',data:{status:'active'}})).toMatchObject({id:'disabled'});
 const config={data:{key:'custom',value:{owner_id:'person-a',user_id:'person-b'}}};
 expect(await normalizeReferences(runtime,spec('config_create'),config)).toEqual(config);expect(checked).toEqual([]);
});
test('identity lookup does not swallow server errors or require directory access for a known account',async()=>{
 failure=503;await expect(normalizeReferences(runtime,spec('admin_profile'),{id:'person-a',data:{}})).rejects.toThrow('business failure');
 failure=403;expect(await normalizeReferences(runtime,spec('tasks_create'),{data:{owner_id:'account-a'}})).toMatchObject({data:{owner_id:'account-a'}});
});
test('catalog does not offer generic updates that the domain always rejects',()=>{
 for(const name of ['dispatch_update','visibility_grants_update'])expect(toolSpecs.some(t=>t.name===name)).toBe(false);
 const director={id:'current',username:'me',tenant_id:'tenant',org_id:'org',role:'center_director',portal_permissions:null};
 expect(toolAvailable(director,spec('portal_file_links_set'))).toBe(false);
 expect(toolAvailable({...director,role:'super_admin'},spec('portal_file_links_set'))).toBe(true);
});
test('bodyless business actions do not require a fictitious data object',()=>{
 for(const name of ['orgs_delete','tasks_publish','dispatch_submit','dispatch_confirm','inbox_read','config_delete','invitations_revoke','invitations_resend','visibility_grants_revoke','admin_project_remove','permission_reset','permission_prune','reports_export']){
  expect(parameters(spec(name)).required).not.toContain('data');
 }
 expect(makeCall(spec('permission_reset'),{query:{subject_id:'account-a'}})).toEqual({path:'/api/v1/rbac/matrix?subject_id=account-a',method:'DELETE'});
});
test('own inbox and report export keep the permissions of their dedicated business routes',()=>{
 const member={id:'current',username:'me',tenant_id:'tenant',org_id:'org',role:'member',portal_permissions:['nexusflow:inbox:read','nexusflow:report:read']};
 for(const name of ['inbox_read','inbox_complete','reports_export'])expect(toolAvailable(member,spec(name))).toBe(true);
 expect(toolAvailable({...member,portal_permissions:[]},spec('inbox_complete'))).toBe(false);
 expect(toolAvailable({...member,feature_denies:['report:view']},spec('reports_export'))).toBe(false);
});
test('tool schemas expose account semantics and supplemental dispatch preserves deny and portal gates',()=>{
 const schema:any=parameters(spec('projects_create'));expect(schema.properties.data.properties.owner_id.description).toContain('不是 people.id');
 expect(accountFields(spec('admin_profile'))).toEqual(['id']);
 const member={id:'current',username:'me',tenant_id:'tenant',org_id:'org',role:'member',portal_permissions:null};
 for(const name of ['dispatch_create','dispatch_submit','dispatch_confirm']){
  expect(toolAvailable(member,spec(name))).toBe(true);
  expect(toolAvailable({...member,feature_denies:['dispatch:manage']},spec(name))).toBe(false);
  expect(toolAvailable({...member,portal_permissions:['nexusflow:task:read']},spec(name))).toBe(false);
 }
});
