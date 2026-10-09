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
  await redis.set(sessionKey(sid),JSON.stringify({user_id:user.id,created_at:Date.now()}),"EX",ttl);
  await redis.sadd(`${config.redisPrefix}user-sessions:${user.id}`,sid);
  await redis.expire(`${config.redisPrefix}user-sessions:${user.id}`,ttl);
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
  const rows=await sql`SELECT id,username,password_hash,display_name,role,tenant_id,org_id,status FROM nexusflow.users WHERE lower(username)=lower(${username})`;
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
  try {const passwordHash=await bcrypt.hash(password,12),tokenHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));const hash=[...new Uint8Array(tokenHash)].map(x=>x.toString(16).padStart(2,"0")).join("");const user=await sql.begin(async tx=>{const invites=await tx`SELECT id,tenant_id,data FROM nexusflow.records WHERE kind='invitations' AND data->>'token_hash'=${hash} AND data->>'status'='active' AND (data->>'expires_at')::timestamptz>now() FOR UPDATE`;const invite=invites[0];if(!invite)throw new Error("invitation expired or invalid");const data=invite.data as Record<string,any>;if(!["member","project_lead","department_deputy","department_director","center_deputy"].includes(data.role))throw new Error("invitation role invalid");const duplicate=await tx`SELECT id FROM nexusflow.users WHERE lower(username)=${username}`;if(duplicate.length)throw new Error("username already exists");const id=crypto.randomUUID();const rows=await tx`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role,tenant_id,org_id,status) VALUES(${id},${username},${passwordHash},${displayName},${data.role},${invite.tenant_id},${data.org_id||null},'active') RETURNING id,username,role,tenant_id,org_id`;const personId=crypto.randomUUID();await tx`INSERT INTO nexusflow.records(id,kind,tenant_id,created_by,data) VALUES(${personId},'people',${invite.tenant_id},${id},${tx.json({name:displayName,user_id:id,org_id:data.org_id,status:"active",daily_standard_hours:8,skills:[]} as any)})`;await tx`UPDATE nexusflow.records SET data=data||${tx.json({status:"used",used_by:id,used_at:new Date().toISOString()} as any)},updated_at=now() WHERE id=${invite.id}`;await tx`INSERT INTO nexusflow.audit(id,actor,tenant_id,action,object_kind,object_id,data) VALUES(${crypto.randomUUID()},${id},${invite.tenant_id},'auth.register','user',${id},${tx.json({invitation_id:invite.id} as any)})`;return rows[0];});const sessionUser:User={id:user.id,username:user.username,role:user.role,tenant_id:user.tenant_id,org_id:user.org_id,portal_permissions:null};const session=await createSession(sessionUser);return c.json({access_token:session,token_type:"bearer",user:{id:user.id,username:user.username,name:displayName,role:user.role}},{status:201,headers:{"set-cookie":cookie(session)}});}catch(e){const message=e instanceof Error?e.message:"registration failed";return c.json({error:message},message.includes("invalid")||message.includes("expired")?401:409);}
}
export async function logout(c:Context) {
  if(redis){const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"")||c.req.header("cookie")?.match(/(?:^|;\s*)nf_session=([^;]+)/)?.[1];if(token){try{const {payload}=await jwtVerify(token,key());if(typeof payload.sid==="string"){const raw=await redis.get(sessionKey(payload.sid));if(raw){const session=JSON.parse(raw) as {user_id:string};await redis.srem(`${config.redisPrefix}user-sessions:${session.user_id}`,payload.sid);}await redis.del(sessionKey(payload.sid));}}catch{}}}
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
    if(!row){const collision=await sql`SELECT id FROM nexusflow.users WHERE lower(username)=lower(${p.username})`;if(collision.length)return c.text("Account linking requires administrator approval",409);
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
  const write=method!=="GET"&&method!=="HEAD";
  let required:string;
  if(path.startsWith("/api/tasks")||path.startsWith("/api/load")||path.startsWith("/api/gantt")||path==="/api/home"||path==="/api/auth/me")required="nexusflow:task:read";
  else if(path.startsWith("/api/projects"))required=write?"nexusflow:project:write":"nexusflow:project:read";
  else if(path.startsWith("/api/dispatch"))required="nexusflow:dispatch:write";
  else if(path.startsWith("/api/approvals"))required="nexusflow:approval:write";
  else if(path.startsWith("/api/files"))required=write?"nexusflow:file:write":"nexusflow:file:read";
  else if(path.startsWith("/api/inbox"))required="nexusflow:inbox:read";
  else if(path.startsWith("/api/reports"))required="nexusflow:report:read";
  else if(path.startsWith("/api/config"))required="nexusflow:config:manage";
  else if(path.startsWith("/api/admin")||path==="/api/seed"||path==="/api/seed/status")required="nexusflow:admin";
  else if(path.startsWith("/api/org")||path.startsWith("/api/people"))required="nexusflow:org:manage";
  else required=write?"nexusflow:task:write":"nexusflow:task:read";
  return user.portal_permissions.includes(required)||(required.endsWith(":read")&&user.portal_permissions.includes(required.replace(":read",":write")))||user.portal_permissions.includes("nexusflow:admin");
}
export async function revokeUserSessions(userId:string) {if(!redis)return;const setKey=`${config.redisPrefix}user-sessions:${userId}`;const ids=await redis.smembers(setKey);if(ids.length)await redis.del(...ids.map(sessionKey));await redis.del(setKey);}
export async function seedAdmin() {
  if(!sql||!config.adminPassword)return;
  const stale=await sql`SELECT id FROM nexusflow.users WHERE role='super_admin' AND username<>${config.adminUsername} AND status='active'`;
  await sql`UPDATE nexusflow.users SET status='disabled',updated_at=now() WHERE role='super_admin' AND username<>${config.adminUsername}`;
  for(const row of stale)await revokeUserSessions(String(row.id));
  const hash=await bcrypt.hash(config.adminPassword,12);
  await sql`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role) VALUES(${crypto.randomUUID()},${config.adminUsername},${hash},'系统管理员','super_admin') ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='super_admin',status='active',updated_at=now()`;
}
