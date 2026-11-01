// 仅在服务器运行。只创建/清理自己持有的 ai_verify_ 独立租户，绝不调用生产 seed。
import { chmod } from 'node:fs/promises';
import { sql } from '../apps/api/src/db.ts';
import { objectRequest } from '../apps/api/src/storage.ts';
import { revokeUserSessions } from '../apps/api/src/auth.ts';
import bcrypt from '../apps/api/node_modules/bcryptjs';
const [action,path]=process.argv.slice(2);
if(process.platform!=='linux'||!path?.startsWith('/opt/nexusflow/verify/')||!sql)throw Error('server-only fixture path and database required');
if(action==='setup'){
 const suffix=Date.now().toString(36)+'_'+crypto.randomUUID().slice(0,8),tenant='ai_verify_'+suffix,foreign=tenant+'_foreign',password=crypto.randomUUID()+crypto.randomUUID(),hash=await bcrypt.hash(password,12);
 const users=Object.fromEntries([['leader','center_director'],['worker','member'],['department1','department_director'],['department2','department_director'],['foreign','center_director']].map(([name,role])=>[name!,{id:crypto.randomUUID(),username:`ai.verify.${name}.${suffix}`,role,tenant_id:name==='foreign'?foreign:tenant,password}]));
 await sql.begin(async tx=>{for(const id of [tenant,foreign])await tx`INSERT INTO nexusflow.tenants(id,code,name,status) VALUES(${id},${id},'AI isolated verification','active')`;for(const [name,user] of Object.entries(users))await tx`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role,tenant_id,status) VALUES(${user.id},${user.username},${hash},${'验收'+name},${user.role!},${user.tenant_id},'active')`;});
 await Bun.write(path,JSON.stringify({owner:'nexusflow-ai-verification',tenant,foreign,users},null,2));await chmod(path,0o600);console.log('isolated fixture ready');
}else if(action==='cleanup'){
 const fixture=await Bun.file(path).json();if(fixture.owner!=='nexusflow-ai-verification'||![fixture.tenant,fixture.foreign].every(id=>/^ai_verify_[a-z0-9_]+$/.test(id)))throw Error('invalid fixture ownership');
 const tenants=[fixture.tenant,fixture.foreign],files=await sql`SELECT data->>'object_key' key FROM nexusflow.records WHERE kind='files' AND tenant_id = ANY(${tenants}::text[])`;
 for(const file of files){if(!tenants.some(tenant=>String(file.key).startsWith(tenant+'/')))throw Error('fixture object key outside owned prefix');await objectRequest('DELETE',String(file.key));}
 for(const user of Object.values(fixture.users) as any[])await revokeUserSessions(user.id);
 await sql.begin(async tx=>{
  for(const table of ['ai_actions','ai_messages','ai_shares','ai_conversations','permission_override','audit','records'])await tx.unsafe(`DELETE FROM nexusflow.${table} WHERE tenant_id = ANY($1::text[])`,[tenants]);
  await tx`DELETE FROM nexusflow.users WHERE tenant_id = ANY(${tenants}::text[])`;await tx`DELETE FROM nexusflow.tenants WHERE id = ANY(${tenants}::text[])`;
 });console.log('isolated fixture cleaned');
}else throw Error('setup|cleanup required');
await sql.end({timeout:5});process.exit(0);
