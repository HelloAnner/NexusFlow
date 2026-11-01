import { expect,test } from 'bun:test';
import { toolSpecs,makeCall,toolAvailable } from '../src/domains/assistant/catalog';
import { assignmentPlans,computeForecast,dateRange,isWorkday } from '../src/domains/planning/service';
import { sanitize } from '../src/domains/assistant/transport';
import { seal,unseal } from '../src/domains/assistant/secrets';
import { modelCatalog,resolveModel } from '../src/domains/assistant/models';
import { extractText } from '../src/domains/planning/files';
import { readExecutionEvents } from '../../../packages/shared/src/sse';
import JSZip from 'jszip';
import app from '../src/router';
import { fingerprint } from '../src/domains/assistant/transport';
const member={id:'u',username:'u',role:'member',tenant_id:'t',org_id:'o',portal_permissions:null};
test('tool catalog is explicit, unique and covers all business domains without privileged escape hatches',()=>{
 expect(toolSpecs.length).toBeGreaterThan(100);expect(new Set(toolSpecs.map(t=>t.name)).size).toBe(toolSpecs.length);
 for(const domain of ['orgs','people','projects','tasks','task_assignments','dispatch','approvals','files','inbox','config','tools','invitations','visibility_grants','worklogs','milestones','admin'])expect(toolSpecs.some(t=>t.domain===domain)).toBe(true);
 expect(toolSpecs.some(t=>/seed|portal\/sync|\/auth\/(login|register|password)|shell|execute_sql/.test(t.path))).toBe(false);
 expect(toolSpecs.filter(t=>t.manager).some(t=>toolAvailable(member,t))).toBe(false);
 const get=toolSpecs.find(t=>t.name==='tasks_get')!;expect(()=>makeCall(get,{id:'../projects'})).toThrow();expect(()=>makeCall(get,{id:'ok',confirmed:true})).toThrow();expect(makeCall(get,{id:'ok'}).path).toBe('/api/tasks/ok');
 const action=toolSpecs.find(t=>t.name==='tasks_pause')!;expect((makeCall(action,{id:'ok',data:{reason:'pause',action:'archive'}}).body as any).action).toBe('pause');
});
test('each tool maps to a registered business route and snapshots are order-independent',()=>{
 for(const spec of toolSpecs){const path=spec.path.replace(/:[a-z]+/g,'object');expect(app.routes.some(route=>route.method===spec.method&&!route.path.includes('*')&&new RegExp('^'+route.path.replace(/:[^/]+/g,'[^/]+')+'$').test(path))).toBe(true);}
 expect(fingerprint({before:1,after:{x:2,y:3}})).toBe(fingerprint({after:{y:3,x:2},before:1}));
});
test('forecast uses confirmed effort and real capacity, not a fabricated date',()=>{
 const days=Array.from({length:6},(_,n)=>({date:`2026-11-${String(n+2).padStart(2,'0')}`,hours:2})),value=computeForecast(20,8,days,'2026-11-04');
 expect(value).toMatchObject({remaining_hours:12,available_before_deadline:6,forecast_date:'2026-11-07',delay_risk:true});
 expect(computeForecast(null,0,days,'2026-11-04')).toMatchObject({known:false,forecast_date:null});expect(computeForecast(10,0,days.map(d=>({...d,hours:0})),'2026-11-04').forecast_date).toBeNull();
});
test('schedule extension preserves distinct assignment hours and non-boundary dates',()=>{
 const task={start_date:'2026-11-02',end_date:'2026-11-06',daily_hours:4},assignments=[{id:'a',user_id:'u',status:'active',start_date:'2026-11-02',end_date:'2026-11-06',daily_hours:4},{id:'b',user_id:'v',status:'active',start_date:'2026-11-03',end_date:'2026-11-04',daily_hours:2}];
 const result=assignmentPlans(task,assignments,{end_date:'2026-11-09'});expect(result.assignments[0]?.end_date).toBe('2026-11-09');expect(result.assignments[1]).toMatchObject({start_date:'2026-11-03',end_date:'2026-11-04',daily_hours:2});
 expect(()=>assignmentPlans(task,assignments,{end_date:'2026-11-02'})).toThrow();expect(()=>dateRange('2026-02-30','2026-03-01')).toThrow();
 expect(isWorkday('2026-11-07',{weekdays:[1,2,3,4,5],holidays:[],extra_workdays:['2026-11-07']})).toBe(true);
});
test('model catalog validates explicit thinking settings without exposing credentials',()=>{
 const names=['NEXUSFLOW_LLM_MODEL','NEXUSFLOW_LLM_API_KEY','NEXUSFLOW_LLM_BASE_URL','NEXUSFLOW_CHAT_MODELS'],saved=names.map(k=>process.env[k]);
 try{process.env.NEXUSFLOW_LLM_MODEL='deepseek-v4.1-flash';process.env.NEXUSFLOW_LLM_API_KEY='private-test';process.env.NEXUSFLOW_LLM_BASE_URL='https://example.invalid/v1';process.env.NEXUSFLOW_CHAT_MODELS='glm-5.3';expect(JSON.stringify(modelCatalog())).not.toContain('private-test');expect(resolveModel().snapshot.thinking_enabled).toBe(false);expect(()=>resolveModel('glm-5.3',false)).toThrow();expect(()=>resolveModel('arbitrary-model')).toThrow();}finally{names.forEach((k,n)=>{if(saved[n]===undefined)delete process.env[k];else process.env[k]=saved[n];});}
});
test('sensitive outputs are redacted and encrypted secure results reject tampering',()=>{
 expect(sanitize({token:'secret',nested:{api_key:'secret',name:'keep'},encrypted_result:'secret'})).toEqual({nested:{name:'keep'}});
 const encrypted=seal({invitation_token:'test-only'});expect(encrypted).not.toContain('test-only');expect(unseal(encrypted)).toEqual({invitation_token:'test-only'});expect(()=>unseal(encrypted.slice(0,-4)+'AAAA')).toThrow();
});
test('SSE handles byte boundaries inside UTF-8 and CRLF separators',async()=>{
 const event={event_type:'response.delta',payload:{delta:'项目'},event_seq:1};const bytes=new TextEncoder().encode('data: '+JSON.stringify(event)+'\r\n\r\n');const stream=new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}}),events:any[]=[];
 await readExecutionEvents(new Response(stream,{headers:{'content-type':'text/event-stream'}}),e=>events.push(e));expect(events).toEqual([event]);
 await expect(readExecutionEvents(new Response('data: broken',{headers:{'content-type':'text/event-stream'}}),()=>{})).rejects.toThrow();
});
test('PDF attachments extract actual page text',async()=>{
 const content='BT /F1 12 Tf 20 100 Td (NexusFlow verified PDF) Tj ET',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,n)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${n+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 expect((await extractText('sample.pdf',new TextEncoder().encode(pdf))).text).toContain('NexusFlow verified PDF');
});
test('Office extraction reads real text and refuses XML entity declarations',async()=>{
 const zip=new JSZip();zip.file('word/document.xml','<w:document xmlns:w="w"><w:p><w:r><w:t>真实成果</w:t></w:r></w:p></w:document>');const result=await extractText('work.docx',await zip.generateAsync({type:'uint8array'}));expect(result.text).toContain('真实成果');
 zip.file('word/document.xml','<!DOCTYPE x [<!ENTITY a "secret">]><x>&a;</x>');await expect(extractText('bad.docx',await zip.generateAsync({type:'uint8array'}))).rejects.toThrow();
});
