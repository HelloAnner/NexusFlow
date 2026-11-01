import { expect,test } from 'bun:test';
import { parseArgs } from '../src/args';
import { commandRequest } from '../src/commands';
import { aiCommand,conversationsCommand } from '../src/assistant';
import type { Client } from '../src/client';
test('chat continuation is a flag and does not consume the question',()=>{const parsed=parseArgs(['chat','--continue','检查下周','--thinking','off','--json']);expect(parsed.options.continue).toBe(true);expect(parsed.positionals).toEqual(['检查下周']);expect(parsed.options.thinking).toBe('off');});
test('planning and worklog commands map to actual APIs with typed schedule values',()=>{
 expect(commandRequest(parseArgs(['planning','preview','t','{"end_date":"2026-11-09"}']))).toEqual({path:'/api/planning/preview/t',method:'POST',body:{end_date:'2026-11-09'}});
 expect(commandRequest(parseArgs(['planning','calendar','--from','2026-11-02','--to','2026-11-06','--person-id','u'])).path).toBe('/api/planning/calendar?from=2026-11-02&to=2026-11-06&person_id=u');
 expect(commandRequest(parseArgs(['worklogs','confirm','w'])).path).toBe('/api/worklogs/w/confirm');
});
test('AI confirmation and conversation operations use authenticated dedicated routes',async()=>{
 const calls:any[]=[];const client={json:async(...args:any[])=>{calls.push(args);return {status:'succeeded'};}} as unknown as Client;
 await aiCommand(client,parseArgs(['ai','confirm','a']));expect(calls[0]).toEqual(['/api/ai/actions/a/confirm','POST',{}]);
 await conversationsCommand(client,parseArgs(['conversations','rename','c','新名称']));expect(calls[1]).toEqual(['/api/ai/conversations/c','PATCH',{title:'新名称'}]);
 await expect(aiCommand(client,parseArgs(['ai','tool','tasks_create','bad-json']))).rejects.toThrow('invalid tool JSON');
});
