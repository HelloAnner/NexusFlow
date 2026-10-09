import { expect, test, mock, beforeEach } from "bun:test";
import { createHash, createHmac } from "node:crypto";

// In-memory mocks only: never open a socket or start a listener.
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;
process.env.JWT_SECRET = "review-only-secret-at-least-32-bytes";
const root = "/Users/anner/cnpc/NexusFlow/apps/api/src";
type Row = { id: string; kind: string; tenant_id: string | null; created_by: string; data: Record<string, any> };
let records: Row[] = [];
let users: Record<string, any>[] = [];
let statements: Array<{ q: string; values: any[] }> = [];
let failDelete = false;
const cache = new Map<string, string>();
const sets = new Map<string, Set<string>>();
const redis: any = {
  status: "ready",
  async get(k: string) { return cache.get(k) ?? null; },
  async set(k: string, v: string) { cache.set(k, v); return "OK"; },
  async eval(script:string,num:number,...args:any[]){if(script.includes("SET")){cache.set(args[0],args[2]);const s=sets.get(args[1])??new Set<string>();s.add(args[3]);sets.set(args[1],s);return 1;}if(script.includes("local raw")){if(failDelete)throw Error("mock Redis deletion failed");const raw=cache.get(args[0]);if(!raw||JSON.parse(raw).user_id!==args[2])return 0;cache.delete(args[0]);sets.get(args[1])?.delete(args[3]);return 1;}if(script.includes("SMEMBERS")){if(failDelete)throw Error("mock Redis deletion failed");const ids=[...(sets.get(args[0])??[])];for(const sid of ids)cache.delete(`${config.redisPrefix}session:${sid}`);sets.delete(args[0]);return ids.length;}return 0;},
  async sadd(k: string, v: string) { const s = sets.get(k) ?? new Set(); s.add(v); sets.set(k, s); },
  async srem(k: string, v: string) { sets.get(k)?.delete(v); },
  async smembers(k: string) { return [...(sets.get(k) ?? [])]; },
  async expire() { return 1; },
  async del(...keys: string[]) { if (failDelete) throw Error("mock Redis deletion failed"); for (const k of keys) { cache.delete(k); sets.delete(k); } return keys.length; },
};
const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
  const q = strings.map((s, i) => s + (i < values.length ? `$${i}` : "")).join("");
  statements.push({ q, values });
  if (values.some(v => v === undefined)) throw Error("UNDEFINED_VALUE: Undefined values are not allowed");
  const idMatch = /(?:WHERE |AND )id=\$(\d+)/.exec(q);
  const kindLiteral = /kind='([a-z_]+)'/.exec(q);
  const kindParam = /kind=\$(\d+)/.exec(q);
  const kind = kindLiteral?.[1] ?? (kindParam ? values[+kindParam[1]!] : undefined);
  const id = idMatch ? values[+idMatch[1]!] : undefined;
  if (q.startsWith("SELECT") && q.includes("FROM nexusflow.records")) {
    if (q.includes("data->>'dispatch_id'")) {const p=/data->>'dispatch_id'=\$(\d+)/.exec(q),s=/data->>'status'='([^']+)'/.exec(q);return records.filter(r=>r.kind==='approvals'&&(!p||r.data.dispatch_id===values[+p[1]!])&&(!s||r.data.status===s[1]));}
    if (q.startsWith("SELECT 1")) {const a=/data->'actions' \? \$(\d+)/.exec(q);return records.filter(r=>r.kind==='visibility_grants'&&r.data.project_id===values[1]&&r.data.user_id===values[2]&&(!a||(r.data.actions||[]).includes(values[+a[1]!]))&&r.data.status!=='revoked');}
    const tenant=/tenant_id IS NOT DISTINCT FROM \$(\d+)/.exec(q),admin=/AND \(\$(\d+) OR tenant_id/.exec(q);let result=records.filter(r=>(!kind||r.kind===kind)&&(id===undefined||r.id===id));if(tenant&&!(admin&&values[+admin[1]!]))result=result.filter(r=>r.tenant_id===values[+tenant[1]!]);const dispatch=/data->>'dispatch_id'=\$(\d+)/.exec(q),status=/data->>'status'='([^']+)'/.exec(q),exclude=/id<>\$(\d+)/.exec(q);if(dispatch)result=result.filter(r=>r.data.dispatch_id===values[+dispatch[1]!]);if(status)result=result.filter(r=>r.data.status===status[1]);if(exclude)result=result.filter(r=>r.id!==values[+exclude[1]!]);return result;
  }
  if (q.startsWith("SELECT") && q.includes("FROM nexusflow.users")) {
    return users.filter(u => id === undefined || u.id === id);
  }
  if (q.startsWith("INSERT INTO nexusflow.records")) {
    records.push({ id: values[0], kind: values[1], tenant_id: values[2], created_by: values[3], data: JSON.parse(JSON.stringify(values[4])) });
    return [];
  }
  if (q.startsWith("UPDATE nexusflow.records")) {
    const payloadIndex = /SET data(?:=data\|\||=)\$(\d+)/.exec(q),dispatch=/data->>'dispatch_id'=\$(\d+)/.exec(q),exclude=/id<>\$(\d+)/.exec(q),status=/data->>'status'='([^']+)'/.exec(q);
    const data = payloadIndex ? values[+payloadIndex[1]!] : {};
    for (const r of records.filter(r => (!kind || r.kind === kind) && (id === undefined || r.id === id)&&(!dispatch||r.data.dispatch_id===values[+dispatch[1]!])&&(!exclude||r.id!==values[+exclude[1]!])&&(!status||r.data.status===status[1]))) {
      r.data = q.includes("data=data||") ? { ...r.data, ...data } : { ...data };
    }
    return [];
  }
  return [];
};
sql.json = (v: any) => v;
sql.begin = async (fn: (tx: any) => Promise<any>) => {
  const snapshot = structuredClone(records);
  try { return await fn(sql); } catch (e) { records = snapshot; throw e; }
};
mock.module(`${root}/db.ts`, () => ({ sql, redis, migrate: async () => {}, probeDependencies: async () => {} }));
const { config } = await import(`${root}/config.ts`);Object.assign(config,{jwtSecret:"review-only-secret-at-least-32-bytes"});
const { createSession, portalAllows, revokeUserSessions } = await import(`${root}/auth.ts`);
const { canReadRecord, canWriteRecord } = await import(`${root}/permissions.ts`);
const { createRecord, updateRecord, listRecords } = await import(`${root}/records.ts`);
const { objectRequest } = await import(`${root}/storage.ts`);
const { default: app } = await import(`${root}/router.ts`);
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => { throw Error("unexpected network attempt blocked by reviewer"); }) as unknown as typeof fetch;
const center: any = { id: "u1", username: "one", role: "center_director", tenant_id: "t1", org_id: "o1", portal_permissions: null };
const member = { ...center, role: "member" };
const department = { ...center, role: "department_director" };
function row(id: string, kind: string, data: Record<string, any>, creator = "u1"): Row { return { id, kind, data, tenant_id: "t1", created_by: creator }; }
function task(id = "task-1", patch = {}) { return { name: "Task", type: "market", owner_id: "u1", member_ids: [], org_id: "o1", start_date: "2026-06-01", end_date: "2026-06-01", daily_hours: 2, status: "draft", ...patch }; }
async function request(path: string, method = "GET", body?: any, user = center) {
  users = [...users.filter(u=>u.id!==user.id),{ ...user, status: "active", portal_id: user.portal_permissions === null ? null : "portal-review-user" }];
  const token = await createSession(user);
  return app.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => { records = []; users = []; statements = []; cache.clear(); sets.clear(); failDelete = false; });

test("department cannot read tasks with no resolvable organization or relation", async () => {
  expect(await canReadRecord(department, "tasks", { tenant_id: "t1", created_by: "outside", data: { owner_id: "outside" } })).toBe(false);
});
test("local tenant reads assigned records without crossing tenant boundary", async () => {
  const localMember = { ...member, tenant_id: "local" };
  const assigned = { ...row("assigned", "tasks", task("assigned", { owner_id: "other", member_ids: ["u1"] }), "other"), tenant_id: "local" };
  records = [assigned, { ...row("foreign", "tasks", task("foreign")), tenant_id: "other" }];
  expect((await listRecords(localMember, "tasks")).map((x:any)=>x.id)).toEqual(["assigned"]);
});
test("Portal scope denies unauthorized writes and unknown routes", () => {
  const portal = { ...member, portal_permissions: ["nexusflow:task:read"] };
  expect(portalAllows(portal, "/api/tasks/task-1/publish", "POST")).toBe(false);
  expect(portalAllows(portal, "/api/unknown-path", "GET")).toBe(false);
});
test("Portal task read scope cannot publish; write scope is required", async () => {
  records = [row("task-1", "tasks", task())];
  const response = await request("/api/tasks/task-1/publish", "POST", {}, { ...member, portal_permissions: ["nexusflow:task:read"] });
  expect(response.status).toBe(403);
  expect(records[0]!.data.status).toBe("draft");
});
test("Portal request and CLI regression checks", async () => {
  const { parseArgs } = await import("/Users/anner/cnpc/NexusFlow/cli/src/args.ts");
  const { commandRequest } = await import("/Users/anner/cnpc/NexusFlow/cli/src/commands.ts");
  expect(commandRequest(parseArgs(["projects", "create", "--json", '{"name":"review"}'])).body).toEqual({name:"review"});
  expect(commandRequest(parseArgs(["config", "versions", "config-1"])).path).toContain("versions");
  const {parseArgs:parse}=await import("/Users/anner/cnpc/NexusFlow/cli/src/args.ts");expect(parse(["x","y","--key=a=b"]).options.key).toBe("a=b");
});
test("logout revokes token and reports Redis failure without revoking index", async () => {
  users = [{ ...center, status: "active", portal_id: null }];
  let token = await createSession(center);
  const headers = { authorization: `Bearer ${token}` };
  expect((await app.request("/api/auth/logout", { method: "POST", headers })).status).toBe(200);
  expect((await app.request("/api/auth/me", { headers })).status).toBe(401);
  token = await createSession(center); failDelete = true;
  const failingHeaders = { authorization: `Bearer ${token}` };
  expect((await app.request("/api/auth/logout", { method: "POST", headers: failingHeaders })).status).toBe(503);
  expect((await app.request("/api/auth/me", { headers: failingHeaders })).status).toBe(200);
  expect([...sets.values()].some(s=>s.size>0)).toBe(true);
});
test("bulk user revocation removes every session and index entry", async()=>{users=[{...center,status:"active"}];const a=await createSession(center),b=await createSession(center);await revokeUserSessions(center.id);expect((await app.request("/api/auth/me",{headers:{authorization:`Bearer ${a}`} })).status).toBe(401);expect((await app.request("/api/auth/me",{headers:{authorization:`Bearer ${b}`} })).status).toBe(401);expect([...sets.values()].every(s=>s.size===0)).toBe(true);});
test("task creation rejects lifecycle bypass, reversed dates, and unrelated assignees", async () => {
  const org=row("o1","orgs",{name:"Org",type:"department",parent_id:null});records=[org];users=[{...member,status:"active",org_id:"o1"}];
  await expect(createRecord(member,"tasks",task("new",{status:"in_progress"}))).rejects.toThrow();
  await expect(createRecord(member,"tasks",task("new",{start_date:"2026-06-05",end_date:"2026-06-01"}))).rejects.toThrow();
  await expect(createRecord(member,"tasks",task("new",{member_ids:["foreign-user"]}))).rejects.toThrow("active same-tenant user required");
});
test("view-only hidden-project grant cannot create a project task", async () => {
  records = [row("o1","orgs",{name:"Org",type:"department",parent_id:null}),row("hidden-project", "projects", { name: "Hidden", visibility: "hidden", owner_id: "other", member_ids: [], org_id: "o1" }, "other"), row("grant-1", "visibility_grants", { project_id: "hidden-project", user_id: "u1", actions: ["view"] })];users=[{...member,status:"active",org_id:"o1"}];
  await expect(createRecord(member, "tasks", task("new", { project_id: "hidden-project" }))).rejects.toThrow("project edit permission required");
});
test("authenticated specialized routes reach actual JSON handlers", async () => {
  records=[row("person-1","people",{name:"Person",user_id:"u1",org_id:"o1"})];
  for (const path of ["/api/orgs/tree", "/api/load/person-1", "/api/load/conflicts", "/api/reports/task-overview", "/api/admin/audit", "/api/tools"]) {
    const response = await request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  }
});
test("invitation roles cannot be changed through generic PATCH", async () => {
  records = [row("invite-1", "invitations", { role: "member", org_id: "o1", status: "active" })];
  await expect(updateRecord(department, "invitations", "invite-1", { role: "center_deputy" })).rejects.toThrow("dedicated revoke/grant action");
});
test("final approval uses record ID and publishes dispatch/task atomically", async () => {
  records = [row("o1","orgs",{name:"Org",type:"department"}),row("approval-1", "approvals", { dispatch_id: "dispatch-1", approver_id: "u1", target_org_id:"o1", step: "department_director", status: "pending" }), row("dispatch-1", "dispatch", { requester_id: "u1", task_id: "task-1", target_org_ids: ["o1"], status: "pending_approval", workflow: "standard" }), row("task-1", "tasks", task("task-1", { status: "pending_coordination" }))];
  users=[{...department,status:"active",org_id:"o1"}];const response = await request("/api/approvals/approval-1/decision", "POST", { approved: true },department);
  expect(response.status).toBe(200);expect(records.find(r=>r.id==="dispatch-1")!.data.status).toBe("published");expect(records.find(r=>r.id==="task-1")!.data.status).toBe("in_progress");
});
test("approval rejection cancels siblings and restores a draft task",async()=>{records=[row("o1","orgs",{name:"Org",type:"department"}),row("approval-1","approvals",{dispatch_id:"dispatch-1",approver_id:"u1",target_org_id:"o1",step:"department_director",status:"pending"}),row("approval-2","approvals",{dispatch_id:"dispatch-1",approver_id:"u2",target_org_id:"o1",step:"department_director",status:"pending"}),row("dispatch-1","dispatch",{requester_id:"u1",task_id:"task-1",target_org_ids:["o1","o2"],status:"pending_approval"}),row("task-1","tasks",task("task-1",{status:"pending_coordination"}))];users=[{...department,status:"active",org_id:"o1"}];const response=await request("/api/approvals/approval-1/decision","POST",{approved:false,reason:"incorrect assignment"},department);expect(response.status).toBe(200);expect(records.find(r=>r.id==="approval-2")!.data.status).toBe("cancelled");expect(records.find(r=>r.id==="dispatch-1")!.data.status).toBe("rejected");expect(records.find(r=>r.id==="task-1")!.data.status).toBe("draft");});
test("conflict force is time-limited and resolution uses a dedicated workflow", async () => {
  records=[row("task-1","tasks",task("task-1",{status:"in_progress",daily_hours:9})),row("conflict-1","conflicts",{task_id:"task-1",person_id:"u1",type:"workload_overload",status:"open"})];
  const forced=await request("/api/conflicts/conflict-1/force","POST",{reason:"approved exception"});expect(forced.status).toBe(200);expect(records.find(r=>r.id==="conflict-1")!.data.status).toBe("forced");expect(records.find(r=>r.id==="conflict-1")!.data.forced_until).toBeTruthy();
  records.find(r=>r.id==="task-1")!.data.daily_hours=1;const resolved=await request("/api/conflicts/conflict-1/resolve","POST",{reason:"schedule corrected"});expect(resolved.status).toBe(200);expect(records.find(r=>r.id==="conflict-1")!.data.status).toBe("resolved");
});
test("draft tasks do not create live risk and person ID resolves account assignments", async () => {
  records = [row("task-1", "tasks", task("task-1", { daily_hours: 9 })), row("person-1", "people", { name: "Person", org_id: "o1", user_id: "u1", daily_standard_hours: 8 })];
  const risk = await request("/api/load/conflicts");
  expect((await risk.json()).items.length).toBe(0);
  records[0]!.data = task("task-1", { status: "in_progress", daily_hours: 5 });
  const person = await request("/api/load/person-1?date=2026-06-01");
  expect((await person.json()).hours).toBe(5);
});
test("hidden task occupancy affects overload without leaking hidden task details", async () => {
  records = [row("hidden-project", "projects", { name: "Hidden", owner_id: "other", member_ids: [], visibility: "hidden", org_id: "o1" }, "other"), row("hidden-task", "tasks", task("hidden-task", { project_id: "hidden-project", owner_id: "target", status: "in_progress", daily_hours: 5 }), "other"), row("candidate", "tasks", task("candidate", { owner_id: "target", daily_hours: 5 })), row("target-person", "people", { name: "Target", user_id: "target", org_id: "o1", daily_standard_hours: 8 })];users=[{id:"target",username:"target",role:"member",tenant_id:"t1",org_id:"o1",status:"active",portal_id:null}];
  const response = await request("/api/tasks/candidate/publish", "POST", {}, department);
  expect(response.status).toBe(200);const result=await response.json();expect(result.conflicts[0].peak_hours).toBe(10);expect(JSON.stringify(result)).not.toContain("hidden-task");
});
test("authorized archived files remain downloadable and downloads are audited", async () => {
  Object.assign(config,{s3Endpoint:"http://minio.invalid:9000",s3AccessKey:"review",s3SecretKey:"review-secret",s3Bucket:"nexusflow",s3Region:"us-east-1"});
  records=[row("task-1","tasks",task("task-1",{status:"archived"})),row("file-1","files",{status:"archived",name:"result.txt",object_key:"result",uploaded_by:"u1",task_id:"task-1",content_type:"text/plain",size_bytes:4})];
  globalThis.fetch=(async()=>new Response("data",{status:200})) as unknown as typeof fetch;const response=await request("/api/files/file-1/download");expect(response.status).toBe(200);expect(await response.text()).toBe("data");expect(statements.some(x=>x.values.includes("file.download"))).toBe(true);
});
test("SigV4 canonical URI uses AWS strict encoding for punctuation and Unicode", async () => {
  Object.assign(config, { s3Endpoint: "http://minio.invalid:9000", s3AccessKey: "review", s3SecretKey: "review-secret", s3Bucket: "nexusflow", s3Region: "us-east-1" });
  let captured: { url: URL; headers: Headers } | undefined;
  globalThis.fetch = (async (url: any, init: any) => { captured = { url: new URL(String(url)), headers: new Headers(init.headers) }; return new Response("", { status: 200 }); }) as typeof fetch;
  try {
    await objectRequest("GET", "test/report!(draft).txt");
    const { url, headers } = captured!;
    const date = headers.get("x-amz-date")!, day = date.slice(0, 8), scope = `${day}/us-east-1/s3/aws4_request`;
    const names = ["host", "x-amz-content-sha256", "x-amz-date"];
    const escaped = url.pathname.replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const canonical = ["GET", escaped, "", names.map(n => `${n}:${headers.get(n)}\n`).join(""), names.join(";"), createHash("sha256").update("").digest("hex")].join("\n");
    const h = (k: any, v: string) => createHmac("sha256", k).update(v).digest();
    const signingKey = h(h(h(h("AWS4review-secret", day), "us-east-1"), "s3"), "aws4_request");
    const expected = createHmac("sha256", signingKey).update(["AWS4-HMAC-SHA256", date, scope, createHash("sha256").update(canonical).digest("hex")].join("\n")).digest("hex");
    const actual = headers.get("authorization")!.split("Signature=")[1];
    expect(actual).toBe(expected);
    const {s3ObjectPath}=await import(`${root}/storage.ts`);expect(s3ObjectPath("","bucket","report!(draft) %é.txt")).toBe("/bucket/report%21%28draft%29%20%25%C3%A9.txt");
  } finally { globalThis.fetch = originalFetch; }
});
