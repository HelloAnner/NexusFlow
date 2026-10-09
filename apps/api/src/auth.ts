import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Context } from "hono";
import { config } from "./config.ts";
import { redis, sql } from "./db.ts";
import type { User } from "./permissions.ts";
const key=()=>new TextEncoder().encode(config.jwtSecret);
const ttl=14*86400;
const sessionKey=(sid:string)=>`${config.redisPrefix}session:${sid}`;
const cookie=(token:string)=>`nf_session=${token}; HttpOnly;${config.secureCookie?" Secure;":""} SameSite=Lax; Path=/; Max-Age=${ttl}`;
export async function createSession(user:User) {
  if(!redis) throw new Error("Redis session store unavailable");
  if(redis.status==="wait") await redis.connect();
  const sid=crypto.randomUUID();
  await redis.eval("redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); redis.call('SADD',KEYS[2],ARGV[2]); redis.call('EXPIRE',KEYS[2],ARGV[3]); return 1",2,sessionKey(sid),`${config.redisPrefix}user-sessions:${user.id}`,JSON.stringify({user_id:user.id,created_at:Date.now()}),sid,ttl);
  return new SignJWT({sid}).setProtectedHeader({alg:"HS256"}).setSubject(user.id).setIssuedAt().setExpirationTime("14d").sign(key());
}
export async function currentUser(c:Context):Promise<User|null> {
  const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"")||c.req.header("cookie")?.match(/(?:^|;\s*)nf_session=([^;]+)/)?.[1];
  if(!token||!redis||!sql)return null;
  try {
    const {payload}=await jwtVerify(token,key());
    if(typeof payload.sid!=="string"||!payload.sub)return null;
    const session=await redis.get(sessionKey(payload.sid));
    if(!session||JSON.parse(session).user_id!==payload.sub)return null;
    const rows=await sql`SELECT id,username,role,tenant_id,org_id,status,portal_id,portal_permissions FROM nexusflow.users WHERE id=${payload.sub}`;
    const row=rows[0];
    if(!row||row.status!=="active")return null;
    return {id:row.id,username:row.username,role:row.role,tenant_id:row.tenant_id,org_id:row.org_id,portal_permissions:row.portal_id?row.portal_permissions||[]:null};
  } catch { return null; }
}
export async function login(c:Context) {
  if(config.loginMode==="portal")return c.json({error:"local login disabled"},403);
  if(!sql||!redis)return c.json({error:"authentication services unavailable"},503);
  const body=await c.req.json().catch(()=>({}));
  const username=String(body.username||"").trim();const password=String(body.password||"");
  const tenant_id=String(body.tenant_id||config.localTenantId);
  const rows=await sql`SELECT id,username,password_hash,display_name,role,tenant_id,org_id,status FROM nexusflow.users WHERE lower(username)=lower(${username}) AND tenant_id=${tenant_id} AND portal_id IS NULL`;
  const row=rows[0];
  if(!row||row.status!=="active"||!await bcrypt.compare(password,row.password_hash))return c.json({error:"invalid credentials"},401);
  if(row.role==="super_admin"&&row.username!==config.adminUsername)return c.json({error:"invalid credentials"},401);
  const user:User={id:row.id,username:row.username,role:row.role,tenant_id:row.tenant_id,org_id:row.org_id,portal_permissions:null};
  const token=await createSession(user);
  return c.json({access_token:token,token_type:"bearer",user:{id:user.id,username:user.username,name:row.display_name,role:user.role}},{headers:{"set-cookie":cookie(token)}});
}
export async function register(c:Context) {
  if(config.loginMode==="portal")return c.json({error:"local registration disabled"},403);
  if(!sql||!redis)return c.json({error:"authentication services unavailable"},503);
  const body=await c.req.json().catch(()=>({}));const username=String(body.username||"").trim().toLowerCase(),displayName=String(body.display_name||"").trim(),password=String(body.password||""),token=String(body.invitation_token||"");
  if(!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)||displayName.length<1||displayName.length>128||password.length<12||password.length>256||!token)return c.json({error:"valid username, display_name, 12-256 character password, and invitation_token required"},400);
  try {const passwordHash=await bcrypt.hash(password,12),tokenHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));const hash=[...new Uint8Array(tokenHash)].map(x=>x.toString(16).padStart(2,"0")).join("");const user=await sql.begin(async tx=>{const invites=await tx`SELECT id,tenant_id,data FROM nexusflow.records WHERE kind='invitations' AND data->>'token_hash'=${hash} AND data->>'status'='active' AND (data->>'expires_at')::timestamptz>now() FOR UPDATE`;const invite=invites[0];if(!invite)throw new Error("invitation expired or invalid");const data=invite.data as Record<string,any>;if(!["member","project_lead","department_deputy","department_director","center_deputy"].includes(data.role))throw new Error("invitation role invalid");const duplicate=await tx`SELECT id FROM nexusflow.users WHERE lower(username)=${username} AND tenant_id IS NOT DISTINCT FROM ${invite.tenant_id}`;if(duplicate.length)throw new Error("username already exists");const id=crypto.randomUUID();const rows=await tx`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role,tenant_id,org_id,status) VALUES(${id},${username},${passwordHash},${displayName},${data.role},${invite.tenant_id},${data.org_id||null},'active') RETURNING id,username,role,tenant_id,org_id`;const personId=crypto.randomUUID();await tx`INSERT INTO nexusflow.records(id,kind,tenant_id,created_by,data) VALUES(${personId},'people',${invite.tenant_id},${id},${tx.json({name:displayName,user_id:id,org_id:data.org_id,status:"active",daily_standard_hours:8,skills:[]} as any)})`;await tx`UPDATE nexusflow.records SET data=data||${tx.json({status:"used",used_by:id,used_at:new Date().toISOString()} as any)},updated_at=now() WHERE id=${invite.id}`;await tx`INSERT INTO nexusflow.audit(id,actor,tenant_id,action,object_kind,object_id,data) VALUES(${crypto.randomUUID()},${id},${invite.tenant_id},'auth.register','user',${id},${tx.json({invitation_id:invite.id} as any)})`;return rows[0];});const sessionUser:User={id:user.id,username:user.username,role:user.role,tenant_id:user.tenant_id,org_id:user.org_id,portal_permissions:null};const session=await createSession(sessionUser);return c.json({access_token:session,token_type:"bearer",user:{id:user.id,username:user.username,name:displayName,role:user.role}},{status:201,headers:{"set-cookie":cookie(session)}});}catch(e){const message=e instanceof Error?e.message:"registration failed";return c.json({error:message},message.includes("invalid")||message.includes("expired")?401:409);}
}
export async function logout(c:Context) {
  const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"")||c.req.header("cookie")?.match(/(?:^|;\s*)nf_session=([^;]+)/)?.[1];
  if(token){let payload;try{payload=(await jwtVerify(token,key())).payload;}catch{payload=null;}if(payload&&typeof payload.sid==="string"&&typeof payload.sub==="string"){if(!redis)return c.json({error:"session store unavailable; session remains active"},503);try{await redis.eval("local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local s=cjson.decode(raw); if s.user_id~=ARGV[1] then return 0 end; redis.call('DEL',KEYS[1]); redis.call('SREM',KEYS[2],ARGV[2]); return 1",2,sessionKey(payload.sid),`${config.redisPrefix}user-sessions:${payload.sub}`,payload.sub,payload.sid);}catch{return c.json({error:"session revocation failed; session remains active"},503);}}}
  return c.json({ok:true},{headers:{"set-cookie":`nf_session=; HttpOnly;${config.secureCookie?" Secure;":""} SameSite=Lax; Path=/; Max-Age=0`}});
}
export async function portalCallback(c:Context) {
  if(!config.portalEnabled&&config.loginMode!=="portal")return c.text("Portal SSO is disabled",404);
  const code=c.req.query("code");if(!code)return c.text("Missing ticket",400);
  try {
    if(!sql||!redis)throw new Error("authentication services unavailable");
    const endpoint=config.portalUrl+(config.portalEndpoint.startsWith("/")?config.portalEndpoint:`/${config.portalEndpoint}`);
    const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({system_code:"nexusflow",code}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)return c.text("Portal ticket rejected",401);
    const p=await response.json() as Record<string,unknown>;
    if(p.system_code!=="nexusflow"||typeof p.user_id!=="string"||!p.user_id||typeof p.username!=="string"||!p.username||typeof p.display_name!=="string"||!p.display_name||typeof p.tenant_id!=="string"||!p.tenant_id||typeof p.expires_at!=="number"||!Number.isFinite(p.expires_at)||p.expires_at<=Date.now()/1000||!Array.isArray(p.portal_roles)||!Array.isArray(p.system_roles)||!Array.isArray(p.permissions)||![...p.portal_roles,...p.system_roles,...p.permissions].every(x=>typeof x==="string"))return c.text("Invalid Portal ticket response",401);
    const portalRoles=p.portal_roles as string[],systemRoles=p.system_roles as string[],permissions=p.permissions as string[];
    const role=portalRoles.some(x=>["tenant_owner","tenant_admin"].includes(x))||systemRoles.some(x=>["tenant_owner","tenant_admin"].includes(x))?"center_director":"member";
    const linked=await sql`SELECT id,username,role,tenant_id,org_id,portal_permissions,status FROM nexusflow.users WHERE portal_id=${p.user_id} AND portal_tenant_id=${p.tenant_id}`;
    let row=linked[0];
    if(!row){const collision=await sql`SELECT id FROM nexusflow.users WHERE lower(username)=lower(${p.username}) AND tenant_id=${p.tenant_id}`;if(collision.length)return c.text("Account linking requires administrator approval",409);
      const hash=await bcrypt.hash(crypto.randomUUID(),12);const uid=crypto.randomUUID();
      const inserted=await sql`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role,tenant_id,status,portal_id,portal_tenant_id,portal_permissions) VALUES(${uid},${p.username},${hash},${p.display_name},${role},${p.tenant_id},'active',${p.user_id},${p.tenant_id},${permissions}) RETURNING id,username,role,tenant_id,org_id,portal_permissions,status`;
      row=inserted[0];
    } else {
      if(row.status!=="active")return c.text("Account disabled",403);
      await sql`UPDATE nexusflow.users SET display_name=${p.display_name},role=${role},portal_permissions=${permissions},updated_at=now() WHERE id=${row.id}`;
      row={...row,role,portal_permissions:permissions};
    }
    const user:User={id:row.id,username:row.username,role:row.role,tenant_id:row.tenant_id,org_id:row.org_id,portal_permissions:row.portal_permissions||[]};
    const token=await createSession(user);
    return new Response(null,{status:302,headers:{location:`${config.basePath||""}/`,"set-cookie":cookie(token),"cache-control":"no-store"}});
  } catch(e) { console.error("portal_callback_failed",e); return c.text("Portal login failed",500); }
}
export function portalAllows(user:User,path:string,method:string) {
  if(user.portal_permissions===null)return true;
  const scope=(name:string)=>user.portal_permissions!.includes(name)||user.portal_permissions!.includes("nexusflow:admin");
  const is=(prefix:string)=>path===prefix||path.startsWith(`${prefix}/`);
  const read=method==="GET",write=["POST","PUT","PATCH","DELETE"].includes(method);
  let required:string|undefined;
  if(path==="/api/auth/me"||path==="/api/home"||path==="/api/gantt"||is("/api/load")||is("/api/tools"))required=read?"nexusflow:task:read":undefined;
  else if(is("/api/tasks"))required=read?"nexusflow:task:read":write?"nexusflow:task:write":undefined;
  else if(is("/api/projects"))required=read?"nexusflow:project:read":write?"nexusflow:project:write":undefined;
  else if(is("/api/dispatch"))required=read?"nexusflow:task:read":write?"nexusflow:dispatch:write":undefined;
  else if(is("/api/approvals"))required=read?"nexusflow:task:read":write?"nexusflow:approval:write":undefined;
  else if(is("/api/files"))required=read?"nexusflow:file:read":write?"nexusflow:file:write":undefined;
  else if(is("/api/inbox"))required=read?"nexusflow:inbox:read":write?"nexusflow:inbox:write":undefined;
  else if(is("/api/reports"))required=read?"nexusflow:report:read":undefined;
  else if(is("/api/config"))required=read?"nexusflow:config:read":write?"nexusflow:config:manage":undefined;
  else if(is("/api/admin")||is("/api/seed"))required="nexusflow:admin";
  else if(is("/api/org")||is("/api/orgs")||is("/api/people")||is("/api/invitations"))required=read?"nexusflow:org:read":write?"nexusflow:org:manage":undefined;
  else if(is("/api/conflicts"))required=read?"nexusflow:task:read":write?"nexusflow:task:write":undefined;
  else if(is("/api/visibility_grants"))required=read?"nexusflow:project:read":write?"nexusflow:project:write":undefined;
  else if(is("/api/milestones")||is("/api/worklogs")||is("/api/mentions"))required=read?"nexusflow:task:read":write?"nexusflow:task:write":undefined;
  return required!==undefined&&scope(required);
}
export async function revokeUserSessions(userId:string) {if(!redis)throw new Error("session store unavailable");const setKey=`${config.redisPrefix}user-sessions:${userId}`;await redis.eval("local ids=redis.call('SMEMBERS',KEYS[1]); for _,sid in ipairs(ids) do redis.call('DEL',ARGV[1]..sid) end; redis.call('DEL',KEYS[1]); return #ids",1,setKey,`${config.redisPrefix}session:`);}
export async function seedAdmin() {
  if(!sql||!config.adminPassword)return;
  const tenant=config.localTenantId;
  const stale=await sql`SELECT id FROM nexusflow.users WHERE tenant_id=${tenant} AND role='super_admin' AND lower(username)<>lower(${config.adminUsername}) AND status='active'`;
  await sql`UPDATE nexusflow.users SET status='disabled',updated_at=now() WHERE tenant_id=${tenant} AND role='super_admin' AND lower(username)<>lower(${config.adminUsername})`;
  for(const row of stale)await revokeUserSessions(String(row.id));
  const hash=await bcrypt.hash(config.adminPassword,12),existing=await sql`SELECT id FROM nexusflow.users WHERE tenant_id=${tenant} AND lower(username)=lower(${config.adminUsername}) AND portal_id IS NULL LIMIT 1`;
  if(existing[0])await sql`UPDATE nexusflow.users SET password_hash=${hash},role='super_admin',status='active',updated_at=now() WHERE id=${existing[0].id}`;
  else await sql`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role,tenant_id) VALUES(${crypto.randomUUID()},${config.adminUsername},${hash},'系统管理员','super_admin',${tenant})`;
}
