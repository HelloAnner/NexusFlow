import { expect, test, mock, beforeEach, afterAll } from "bun:test";
import { createHash, createHmac } from "node:crypto";
// Reviewer checks only: pure memory SQL/Redis models, no sockets or listeners.
delete process.env.DATABASE_URL; delete process.env.REDIS_URL; delete process.env.APP_ENV;
process.env.JWT_SECRET = "review-only-secret-at-least-32-bytes";
const root = new URL("../src", import.meta.url).pathname;
type Row = { id:string; kind:string; tenant_id:string|null; created_by:string; data:Record<string,any>; updated_at:Date; created_at:Date };
let records:Row[] = [], users:any[] = [], audits:any[] = [], failRevoke=false;
const cache=new Map<string,string>(), sets=new Map<string,Set<string>>();
const redis:any={status:"ready", get:async(k:string)=>cache.get(k)??null,
  async eval(script:string,n:number,...args:any[]) {
    const keys=args.slice(0,n), a=args.slice(n);
    if(script.includes("'SET'")){cache.set(keys[0],a[0]);const s=sets.get(keys[1])??new Set<string>();s.add(a[1]);sets.set(keys[1],s);return 1;}
    if(failRevoke)throw Error("mock atomic revocation failure");
    if(script.includes("'SMEMBERS'")){const ids=[...(sets.get(keys[0])??[])];for(const sid of ids)cache.delete(a[0]+sid);sets.delete(keys[0]);return ids.length;}
    const raw=cache.get(keys[0]);if(!raw||JSON.parse(raw).user_id!==a[0])return 0;cache.delete(keys[0]);sets.get(keys[1])?.delete(a[1]);return 1;
  }
};
function equalFilter(items:any[],q:string,v:any[],field:string) {
  const match=new RegExp(`(?:WHERE |AND |OR )${field}=(\\$\\d+|'[^']*')`).exec(q);
  if(!match)return items;
  const value=match[1]!.startsWith("$")?v[Number(match[1]!.slice(1))]:match[1]!.slice(1,-1);
  return items.filter(r=>r[field]===value);
}
const sql:any=async(strings:TemplateStringsArray,...v:any[])=>{
  const q=strings.map((s,i)=>s+(i<v.length?`$${i}`:"")).join("");
  if(v.some(x=>x===undefined))throw Error("UNDEFINED_VALUE");
  let candidates:any[]=q.includes("nexusflow.users")&&!q.includes("nexusflow.records")?users:records;
  const tenant=/tenant_id IS NOT DISTINCT FROM \$(\d+)/.exec(q), admin=/AND \(\$(\d+) OR tenant_id/.exec(q);
  if(tenant&&!(admin&&v[+admin[1]!]))candidates=candidates.filter(r=>r.tenant_id===v[+tenant[1]!]);
  const person=/\(id=\$(\d+) OR data->>'user_id'=\$(\d+)\)/.exec(q);
  if(person)candidates=candidates.filter(r=>r.id===v[+person[1]!]||r.data?.user_id===v[+person[2]!]);
  else candidates=equalFilter(candidates,q,v,"id");
  candidates=equalFilter(candidates,q,v,"kind");
  if(q.includes("nexusflow.users")&&!q.includes("nexusflow.records")){
    candidates=equalFilter(candidates,q,v,"org_id");candidates=equalFilter(candidates,q,v,"status");candidates=equalFilter(candidates,q,v,"role");
    candidates=equalFilter(candidates,q,v,"portal_id");candidates=equalFilter(candidates,q,v,"portal_tenant_id");
    const name=/lower\(username\)=(?:lower\()?\$(\d+)/.exec(q);if(name)candidates=candidates.filter(r=>r.username.toLowerCase()===String(v[+name[1]!]).toLowerCase());
    if(q.includes("role IN ('department_director','department_deputy')"))candidates=candidates.filter(r=>['department_director','department_deputy'].includes(r.role));
  }
  for(const m of q.matchAll(/data->>'([a-z_]+)'=(\$\d+|'[^']*')/g)){
    const value=m[2]!.startsWith("$")?v[Number(m[2]!.slice(1))]:m[2]!.slice(1,-1);candidates=candidates.filter(r=>String(r.data?.[m[1]!]??"")===String(value));
  }
  const action=/data->'actions' \? \$(\d+)/.exec(q);if(action)candidates=candidates.filter(r=>r.data.actions?.includes(v[+action[1]!]));
  if(q.includes("coalesce(data->>'status','active')='active'"))candidates=candidates.filter(r=>(r.data.status??"active")==="active");
  if(q.includes("expires_at"))candidates=candidates.filter(r=>!r.data?.expires_at||Date.parse(r.data.expires_at)>Date.now());
  if(q.includes("forced_until")&&q.includes(">now()"))candidates=candidates.filter(r=>Date.parse(r.data.forced_until)>Date.now());
  const exclude=/id<>\$(\d+)/.exec(q);if(exclude)candidates=candidates.filter(r=>r.id!==v[+exclude[1]!]);
  if(q.startsWith("SELECT"))return candidates;
  if(q.startsWith("INSERT INTO nexusflow.records")){records.push(row(v[0],v[1],structuredClone(v[4]),v[3],v[2]));return [];}
  if(q.startsWith("INSERT INTO nexusflow.audit")){audits.push({q,v});return [];}
  if(q.startsWith("UPDATE nexusflow.records")){
    const payload=/SET data(?:=data\|\||=)\$(\d+)/.exec(q);for(const r of candidates){const patch=payload?v[+payload[1]!]:{};r.data=q.includes("data=data||")?{...r.data,...patch}:{...patch};r.updated_at=new Date(r.updated_at.valueOf()+1);}return [];
  }
  return [];
};
sql.json=(v:any)=>v;sql.begin=async(fn:any)=>{const old=structuredClone(records),audit=structuredClone(audits);try{return await fn(sql);}catch(e){records=old;audits=audit;throw e;}};
mock.module(`${root}/db.ts`,()=>({sql,redis,migrate:async()=>{},probeDependencies:async()=>{}}));
const {config}=await import(`${root}/config.ts`);Object.assign(config,{jwtSecret:"review-only-secret-at-least-32-bytes"});
const {createSession,portalAllows}=await import(`${root}/auth.ts`);
const {canReadRecord,canProjectAction,canManageOrganization}=await import(`${root}/permissions.ts`);
const {createRecord,updateRecord,listRecords}=await import(`${root}/records.ts`);
const {objectRequest}=await import(`${root}/storage.ts`);
const {default:app}=await import(`${root}/router.ts`);
const {parseArgs}=await import(new URL("../../../cli/src/args.ts", import.meta.url).pathname);
const {commandRequest}=await import(new URL("../../../cli/src/commands.ts", import.meta.url).pathname);
const previousFetch=globalThis.fetch, initialConfig={...config};
const blockFetch=async()=>{throw Error("reviewer blocked unexpected network access");};
globalThis.fetch=blockFetch as unknown as typeof fetch;
const center:any={id:"u1",username:"one",role:"center_director",tenant_id:"t1",org_id:"o1",portal_permissions:null};
const member={...center,role:"member"}, department={...center,role:"department_director"}, lead={...center,role:"project_lead"};
function row(id:string,kind:string,data:any,creator="u1",tenant:string|null="t1"):Row{return {id,kind,data,created_by:creator,tenant_id:tenant,created_at:new Date(0),updated_at:new Date(0)};}
function task(patch:any={}){return {name:"Task",type:"market",owner_id:"u1",org_id:"o1",member_ids:[],start_date:"2026-06-01",end_date:"2026-06-01",daily_hours:2,status:"draft",all_day:false,...patch};}
function addAccount(user:any){const account={...user,status:"active",portal_id:user.portal_permissions===null?null:"portal-review"};users=users.filter(u=>u.id!==user.id);users.push(account);}
async function request(path:string,method="GET",body?:any,user=center){addAccount(user);const token=await createSession(user);return app.request(path,{method,headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
beforeEach(()=>{Object.assign(config,initialConfig);records=[row("c1","orgs",{name:"Center",type:"center"}),row("o1","orgs",{name:"One",type:"department",parent_id:"c1"}),row("o2","orgs",{name:"Two",type:"department",parent_id:"c1"})];users=[{...member,status:"active",portal_id:null},{...member,id:"u2",username:"two",org_id:"o2",status:"active",portal_id:null}];audits=[];cache.clear();sets.clear();failRevoke=false;globalThis.fetch=blockFetch as unknown as typeof fetch;});
afterAll(()=>{globalThis.fetch=previousFetch;});

test("R1: deny unknown-owner orgless departmental read and allow NULL-tenant assigned task",async()=>{
 expect(await canReadRecord(department,"tasks",row("x","tasks",{owner_id:"missing"},"missing"))).toBe(false);
 const local={...member,tenant_id:null};records.push(row("assigned","tasks",task({owner_id:"other",member_ids:["u1"]}),"other",null));
 expect((await listRecords(local,"tasks")).map((t:any)=>t.id)).toContain("assigned");
});
test("R2: normal logout revokes; storage failure must report 503 and retain revocation index",async()=>{
 addAccount(center);let token=await createSession(center),headers={authorization:`Bearer ${token}`};
 expect((await app.request("/api/auth/logout",{method:"POST",headers})).status).toBe(200);expect((await app.request("/api/auth/me",{headers})).status).toBe(401);
 token=await createSession(center);headers={authorization:`Bearer ${token}`};failRevoke=true;
 expect((await app.request("/api/auth/logout",{method:"POST",headers})).status).toBe(503);expect((await app.request("/api/auth/me",{headers})).status).toBe(200);expect(sets.get(`${config.redisPrefix}user-sessions:u1`)?.size).toBe(1);
});
test("R3: Portal read-only cannot publish and unknown domain fails closed",async()=>{
 const portal={...member,portal_permissions:["nexusflow:task:read"]};expect(portalAllows(portal,"/api/unknown","GET")).toBe(false);
 records.push(row("task-1","tasks",task()));expect((await request("/api/tasks/task-1/publish","POST",{},portal)).status).toBe(403);expect(records.find(r=>r.id==="task-1")!.data.status).toBe("draft");
});
test("R4: reject CREATE active lifecycle, reversed dates and foreign assignees; allow valid draft",async()=>{
 await expect(createRecord(member,"tasks",task({status:"in_progress"}))).rejects.toThrow();
 await expect(createRecord(member,"tasks",task({start_date:"2026-06-05"}))).rejects.toThrow();
 await expect(createRecord(member,"tasks",task({org_id:"c1",member_ids:["u2"]}))).rejects.toThrow();
 expect((await createRecord(member,"tasks",task()))?.status).toBe("draft");
});
test("R5: reject view-only hidden project task CREATE",async()=>{
 records.push(row("p1","projects",{name:"Hidden",owner_id:"u2",member_ids:[],org_id:"o1",visibility:"hidden",status:"planning"},"u2"),row("g1","visibility_grants",{project_id:"p1",user_id:"u1",actions:["view"]}));
 await expect(createRecord(member,"tasks",task({project_id:"p1"}))).rejects.toThrow();
});
test("R6: invitation PATCH must not escalate role",async()=>{
 records.push(row("invite","invitations",{role:"member",org_id:"o1",status:"active"}));await expect(updateRecord(department,"invitations","invite",{role:"center_deputy"})).rejects.toThrow();
});
test("R7: final approval completes linked dispatch/task and rejects repeat decision",async()=>{
 records.push(row("a1","approvals",{dispatch_id:"d1",approver_id:"u1",step:"center_director",status:"pending"}),row("d1","dispatch",{task_id:"task-1",requester_id:"u1",target_org_ids:["o1"],status:"pending_approval"}),row("task-1","tasks",task({status:"pending_coordination"})));
 expect((await request("/api/approvals/a1/decision","POST",{approved:true})).status).toBe(200);
 expect(records.find(r=>r.id==="d1")!.data.status).toBe("published");expect(records.find(r=>r.id==="task-1")!.data.status).toBe("in_progress");expect((await request("/api/approvals/a1/decision","POST",{approved:true})).status).toBe(409);
});
test("R8: conflict resolve works only after actual conflict cleared",async()=>{
 records.push(row("task-1","tasks",task({status:"done"})),row("f1","conflicts",{task_id:"task-1",type:"workload_overload",person_id:"u1",status:"open"}));
 expect((await request("/api/conflicts/f1/resolve","POST",{reason:"schedule cleared"})).status).toBe(200);expect(records.find(r=>r.id==="f1")!.data.status).toBe("resolved");
});
test("R9: conflict force operates and is time limited",async()=>{
 records.push(row("task-1","tasks",task({daily_hours:9,status:"in_progress"})),row("f1","conflicts",{task_id:"task-1",person_id:"u1",type:"workload_overload",status:"open"}));
 expect((await request("/api/conflicts/f1/force","POST",{reason:"approved exception"})).status).toBe(200);const issue=records.find(r=>r.id==="f1")!.data;expect(issue.status).toBe("forced");expect(Date.parse(issue.forced_until)).toBeGreaterThan(Date.now());
});
test("R10: drafts absent from live risk and profile-ID maps to account load",async()=>{
 records.push(row("task-1","tasks",task({daily_hours:9})),row("person-1","people",{name:"One",org_id:"o1",user_id:"u1",daily_standard_hours:8}));
 expect((await (await request("/api/load/conflicts")).json()).items).toEqual([]);records.find(r=>r.id==="task-1")!.data.status="in_progress";
 expect((await (await request("/api/load/person-1?date=2026-06-01")).json()).hours).toBe(9);
});
test("R11: hidden occupancy contributes capacity without disclosing hidden task",async()=>{
 records.push(row("p1","projects",{name:"Hidden",owner_id:"u2",member_ids:[],org_id:"o1",visibility:"hidden"},"u2"),row("hidden","tasks",task({project_id:"p1",status:"in_progress",daily_hours:5}),"u2"),row("candidate","tasks",task({daily_hours:5})));
 const response=await request("/api/tasks/candidate/publish","POST",{},department);expect(response.status).toBe(200);const body=await response.json();expect(body.conflicts.some((i:any)=>i.type==="workload_overload"&&i.peak_hours===10)).toBe(true);expect(JSON.stringify(body.conflicts)).not.toContain('"hidden"');
});
test("R12: archived file download succeeds with body and audit",async()=>{
 records.push(row("file-1","files",{name:"result.txt",status:"archived",object_key:"result",uploaded_by:"u1",size_bytes:6,content_type:"text/plain"}));Object.assign(config,{s3Endpoint:"http://minio.invalid",s3AccessKey:"a",s3SecretKey:"s",s3Bucket:"b"});globalThis.fetch=(async()=>new Response("result")) as unknown as typeof fetch;
 const response=await request("/api/files/file-1/download");expect(response.status).toBe(200);expect(await response.text()).toBe("result");expect(audits.some(a=>a.v.includes("file.download"))).toBe(true);
});
test("R13: SigV4 signatures equal independent strict-URI expected signature",async()=>{
 Object.assign(config,{s3Endpoint:"http://minio.invalid:9000",s3AccessKey:"review",s3SecretKey:"review-secret",s3Bucket:"nexusflow",s3Region:"us-east-1"});
 for(const key of ["test/report!(draft).txt","test/中文 空格%star*quote'.txt"]){let captured:any;globalThis.fetch=(async(url:any,init:any)=>{captured={url:new URL(String(url)),headers:new Headers(init.headers)};return new Response("");}) as unknown as typeof fetch;await objectRequest("GET",key);
 const h=captured.headers as Headers,date=h.get("x-amz-date")!,day=date.slice(0,8),scope=`${day}/us-east-1/s3/aws4_request`,names=["host","x-amz-content-sha256","x-amz-date"],encode=(v:string)=>encodeURIComponent(v).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`),uri="/nexusflow/"+key.split("/").map(encode).join("/");
 const canonical=["GET",uri,"",names.map(n=>`${n}:${h.get(n)}\n`).join(""),names.join(";"),createHash("sha256").update("").digest("hex")].join("\n"),mac=(k:any,v:string)=>createHmac("sha256",k).update(v).digest(),signing=mac(mac(mac(mac("AWS4review-secret",day),"us-east-1"),"s3"),"aws4_request"),expected=createHmac("sha256",signing).update(["AWS4-HMAC-SHA256",date,scope,createHash("sha256").update(canonical).digest("hex")].join("\n")).digest("hex");expect(h.get("authorization")!.split("Signature=")[1]).toBe(expected);expect(captured.url.pathname).toBe(uri);}
});
test("deputy authority is limited to explicitly delegated organization scopes",async()=>{const deputy={...member,id:"u4",username:"deputy",role:"department_deputy",org_id:"o1"};users.push({...deputy,status:"active",portal_id:null});const response=await request("/api/admin/users/u4/delegations","PUT",{org_ids:["o2"],reason:"cover department"},center);expect(response.status).toBe(200);expect(await canManageOrganization(deputy,"o2")).toBe(true);expect(await canManageOrganization(deputy,"o1")).toBe(true);});
test("file rollback creates a new authorized version from the selected version",async()=>{Object.assign(config,{s3Endpoint:"http://minio.invalid:9000",s3AccessKey:"review",s3SecretKey:"review-secret",s3Bucket:"nexusflow",s3Region:"us-east-1"});records.push(row("v2","files",{name:"report.txt",category:"personal-report",object_key:"v2",content_type:"text/plain",size_bytes:3,uploaded_by:"u1",access_scope:"uploader",status:"active",version_group:"group-1",version_number:2}),row("v1","files",{name:"report.txt",category:"personal-report",object_key:"v1",content_type:"text/plain",size_bytes:3,uploaded_by:"u1",access_scope:"uploader",status:"archived",version_group:"group-1",version_number:1}));globalThis.fetch=(async(_url:any,init:any)=>new Response(init.method==="GET"?"old":"",{status:200})) as unknown as typeof fetch;const response=await request("/api/files/v2/rollback","POST",{version_id:"v1",reason:"restore prior report"});expect(response.status).toBe(201);const restored=await response.json();expect(restored.version_number).toBe(3);expect(restored.rollback_of).toBe("v1");expect(restored.status).toBe("active");});
test("task assignments support create, confirmation, work submission, and review",async()=>{const teammate={...member,id:"u3",username:"three",org_id:"o1"};users.push({...teammate,status:"active",portal_id:null});const taskRecord=await createRecord(center,"tasks",task()),assigned=await createRecord(center,"task_assignments",{task_id:taskRecord!.id,user_id:"u3",start_date:taskRecord!.start_date,end_date:taskRecord!.end_date,daily_hours:3});expect(assigned?.status).toBe("assigned");expect((await request(`/api/tasks/${taskRecord!.id}/publish`,"POST",{},center)).status).toBe(200);expect(records.find(r=>r.id===assigned!.id)!.data.status).toBe("pending_confirmation");expect((await request(`/api/task_assignments/${assigned!.id}/action`,"POST",{action:"confirm"},teammate)).status).toBe(200);expect((await request(`/api/task_assignments/${assigned!.id}/action`,"POST",{action:"submit",result:"completed work"},teammate)).status).toBe(200);expect((await request(`/api/task_assignments/${assigned!.id}/action`,"POST",{action:"accept"},center)).status).toBe(200);expect(records.find(r=>r.id===assigned!.id)!.data.progress).toBe(100);records.push(row("p3","people",{name:"Three",user_id:"u3",org_id:"o1",daily_standard_hours:8}));const load=await request("/api/load/u3?date=2026-06-01","GET",undefined,center);expect((await load.json()).hours).toBe(0);});
test("project lifecycle is controlled while active project metadata remains editable",async()=>{const project=await createRecord(center,"projects",{name:"Lifecycle",owner_id:"u1",org_id:"o1",member_ids:[]});const start=await request(`/api/projects/${project!.id}/action`,"POST",{action:"start"});expect(start.status).toBe(200);const edit=await request(`/api/projects/${project!.id}`,"PATCH",{summary:"updated"});expect(edit.status).toBe(200);expect((await edit.json()).status).toBe("active");const pause=await request(`/api/projects/${project!.id}/action`,"POST",{action:"pause",reason:"schedule"});expect(pause.status).toBe(200);expect((await pause.json()).status).toBe("paused");});
test("published task-type configuration is read by task creation",async()=>{const draft=await createRecord(center,"config",{key:"task_types",value:{types:["field-demo"]}});expect(draft?.status).toBe("draft");const response=await request(`/api/config/${draft!.id}/publish`,"POST",{reason:"add supported field task type"});expect(response.status).toBe(200);const created=await createRecord(member,"tasks",task({type:"field-demo"}));expect(created?.type).toBe("field-demo");});
test("R14: CLI flags preserve positional JSON, equals, and versions operation",()=>{
 expect(commandRequest(parseArgs(["projects","create","--json",'{"name":"review"}'])).body).toEqual({name:"review"});expect(parseArgs(["projects","list","--q=a=b"]).options.q).toBe("a=b");expect(commandRequest(parseArgs(["config","versions","c1"])).path).toBe("/api/config/c1/versions");
});
// The following are required-denial/required-completion tests, NOT assertions that a bug occurs.
test("N1: view-only manager cannot PATCH hidden task",async()=>{
 users[1]!.org_id="o1";
 records.push(row("p1","projects",{name:"Hidden",owner_id:"u2",member_ids:[],org_id:"o1",visibility:"hidden"},"u2"),row("g1","visibility_grants",{project_id:"p1",user_id:"u1",actions:["view"]}),row("task-1","tasks",task({owner_id:"u2",project_id:"p1"}),"u2"));
 const response=await request("/api/tasks/task-1","PATCH",{name:"unauthorized"},department);expect(response.status).toBe(403);expect(records.find(r=>r.id==="task-1")!.data.name).toBe("Task");
});
test("N2: view-only manager cannot manufacture an edit grant",async()=>{
 users[1]!.org_id="o1";
 records.push(row("p1","projects",{name:"Hidden",owner_id:"u2",member_ids:[],org_id:"o1",visibility:"hidden"},"u2"),row("g1","visibility_grants",{project_id:"p1",user_id:"u1",actions:["view"]}));
 const response=await request("/api/visibility_grants","POST",{project_id:"p1",user_id:"u1",actions:["view","edit"]},department);expect(response.status).toBe(403);expect(await canProjectAction(department,"p1","edit")).toBe(false);
});
test("N3: view grant must actually enable ordinary member read",async()=>{
 users[1]!.org_id="o1";
 const p=row("p1","projects",{name:"Hidden",owner_id:"u2",member_ids:[],org_id:"o1",visibility:"hidden"},"u2");records.push(p,row("g1","visibility_grants",{project_id:"p1",user_id:"u1",actions:["view"]}));expect(await canReadRecord(member,"projects",p)).toBe(true);
});
test("N4: department cannot revoke another department invitation",async()=>{
 records.push(row("invite","invitations",{org_id:"o2",status:"active",role:"member",token_hash:"hashed-secret",expires_at:new Date(Date.now()+86400000).toISOString()},"u2"));const response=await request("/api/invitations/invite/revoke","POST",{},department);expect([403,404]).toContain(response.status);expect(records.find(r=>r.id==="invite")!.data.status).toBe("active");
});
test("N5: Portal administrator must reach admin/audit/users GET",async()=>{
 const portal={...center,portal_permissions:["nexusflow:admin"]};expect(portalAllows(portal,"/api/admin/audit","GET")).toBe(true);expect((await request("/api/admin/users","GET",undefined,portal)).status).toBe(200);
});
test("N6: dispatch PATCH cannot rebind to unauthorized task",async()=>{
 records.push(row("p2","projects",{name:"Foreign",owner_id:"u2",org_id:"o2",visibility:"hidden",member_ids:[]},"u2"),row("foreign-task","tasks",task({owner_id:"u2",org_id:"o2",project_id:"p2"}),"u2"),row("own-task","tasks",task()),row("d1","dispatch",{task_id:"own-task",requester_id:"u1",workflow:"standard",status:"draft",target_org_ids:["o1"]}));
 const response=await request("/api/dispatch/d1","PATCH",{task_id:"foreign-task"},department);expect([400,403,404,409]).toContain(response.status);expect(records.find(r=>r.id==="d1")!.data.task_id).toBe("own-task");
});
test("N7: active task overview remains editable and audited",async()=>{
 records.push(row("task-1","tasks",task({status:"in_progress"})));const response=await request("/api/tasks/task-1","PATCH",{summary:"new version"},member);expect(response.status).toBe(200);expect(records.find(r=>r.id==="task-1")!.data.summary).toBe("new version");
});
test("N8: project lead cannot directly publish unapproved cross-department assignment",async()=>{
 const created=await createRecord(lead,"tasks",task({org_id:"c1",member_ids:["u2"]}));const response=await request(`/api/tasks/${created!.id}/publish`,"POST",{},lead);expect([403,409]).toContain(response.status);expect(records.find(r=>r.id===created!.id)!.data.status).not.toBe("in_progress");
});
test("N10a: actual Portal administrator grants must allow report export",()=>{
 const portalAdmin={...center,portal_permissions:["nexusflow:admin","nexusflow:report:read"]};expect(portalAllows(portalAdmin,"/api/reports/task-overview/export","POST")).toBe(true);
});
test("N10b: actual Portal member grants must allow own Inbox read-state change",()=>{
 const portalMember={...member,portal_permissions:["nexusflow:inbox:read"]};expect(portalAllows(portalMember,"/api/inbox/my-item/read","POST")).toBe(true);
});
test("N12: client cannot omit an actual assignee department from dispatch approvals",async()=>{
 const created=await createRecord(lead,"tasks",task({org_id:"c1",member_ids:["u2"]}));
 const response=await request("/api/dispatch","POST",{task_id:created!.id,requester_id:"u1",workflow:"standard",target_org_ids:["o1"]},lead);
 expect(response.status).toBe(400);
});
test("N11: seven-day heatmap must not disclose hidden task identifiers",async()=>{
 const today=new Date().toISOString().slice(0,10);users.push({...member,id:"u3",username:"three",status:"active",org_id:"o1",portal_id:null});
 records.push(row("person-3","people",{name:"Three",org_id:"o1",user_id:"u3",status:"active",daily_standard_hours:8}),row("hidden-project","projects",{name:"Hidden",owner_id:"u3",org_id:"o1",member_ids:["u3"],visibility:"hidden"},"u3"),row("hidden-sensitive-task","tasks",task({owner_id:"u3",project_id:"hidden-project",start_date:today,end_date:today,status:"in_progress"}),"u3"));
 const response=await request("/api/home","GET",undefined,department);expect(response.status).toBe(200);const body=await response.json();expect(JSON.stringify(body.team_load_7d)).not.toContain("hidden-sensitive-task");
});
test("N13: another uploader's private archived file must not block my own upload",async()=>{
 users[1]!.org_id="o1";const uploader={...member,id:"u2",username:"two"};
 const prior=row("private-v1","files",{name:"report.txt",category:"personal-report",project_id:"p1",task_id:"task-1",uploaded_by:"u1",access_scope:"uploader",status:"archived",object_key:"old",size_bytes:4,version_group:createHash("sha256").update("t1:p1:task-1:report.txt").digest("hex"),version_number:1});
 records.push(row("p1","projects",{name:"Shared",owner_id:"u1",org_id:"o1",member_ids:["u1","u2"],visibility:"normal",status:"planning"}),row("task-1","tasks",task({project_id:"p1",member_ids:["u2"],status:"in_progress"})),prior);
 expect(await canReadRecord(uploader,"files",prior)).toBe(false);Object.assign(config,{s3Endpoint:"http://minio.invalid",s3AccessKey:"a",s3SecretKey:"s",s3Bucket:"b"});globalThis.fetch=(async()=>new Response("")) as unknown as typeof fetch;
 addAccount(uploader);const token=await createSession(uploader),form=new FormData();form.set("file",new File(["mine"],"report.txt",{type:"text/plain"}));form.set("category","personal-report");form.set("task_id","task-1");
 const response=await app.request("/api/files/upload",{method:"POST",headers:{authorization:`Bearer ${token}`},body:form});expect(response.status).toBe(201);
});
test("N14: period file report must handle postgres.js Date timestamps",async()=>{
 const file=row("f1","files",{name:"report.txt",category:"overall-report",status:"active",uploaded_by:"u1",object_key:"data",size_bytes:4});file.created_at=new Date("2026-06-01T12:00:00Z");records.push(file);
 const response=await request("/api/reports/files?from=2026-06-01&to=2026-06-01");expect(response.status).toBe(200);expect((await response.json()).payload.total).toBe(1);
});
test("N9: departmental person-load query must not disclose out-of-scope staffing",async()=>{
 records.push(row("p2","people",{name:"Outside",org_id:"o2",user_id:"u2",daily_standard_hours:8},"u2"),row("outside","tasks",task({owner_id:"u2",org_id:"o2",status:"in_progress",daily_hours:6}),"u2"));expect([403,404]).toContain((await request("/api/load/u2?date=2026-06-01","GET",undefined,department)).status);
});
