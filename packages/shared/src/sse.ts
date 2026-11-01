export type ExecutionEvent={event_id:string;event_seq:number;event_type:string;response_message_id:string;payload:Record<string,any>;occurred_at:string};
// 与 DocuMind 相同的 SSE/Atom 结构；浏览器和 CLI 使用同一个分块解析器。
export async function readExecutionEvents(response:Response,onEvent:(event:ExecutionEvent)=>void){
 if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||`对话失败 (${response.status})`);}
 if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw Error('服务器没有返回对话事件流');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 const flush=()=>{let index:number;while((index=buffer.search(/\r?\n\r?\n/))>=0){const separator=buffer.slice(index).match(/^\r?\n\r?\n/)![0],frame=buffer.slice(0,index);buffer=buffer.slice(index+separator.length);const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data){const event=JSON.parse(data);if(typeof event.event_type!=='string'||!event.payload)throw Error('无效对话事件');onEvent(event);}}};
 try{for(;;){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});if(buffer.length>4*1024*1024)throw Error('对话事件超过安全大小');flush();if(done){if(buffer.trim()&&!buffer.trim().startsWith(':'))throw Error('对话事件不完整');break;}}}finally{reader.releaseLock();}
}
