import { expect,test } from 'bun:test';
import { ROUTE_CACHE_INIT_SCRIPT } from '../../web/lib/route-cache';
test('Next route fetches bypass previously immutable payloads without changing business requests',async()=>{
 const calls:Array<{input:unknown;init?:RequestInit}>=[];
 const browser={fetch:async(input:unknown,init?:RequestInit)=>{calls.push({input,init});return new Response(init?.cache==='no-store'?'fresh':'old cached components');}};
 new Function('window','Headers','Request',ROUTE_CACHE_INIT_SCRIPT)(browser,Headers,Request);
 const signal=new AbortController().signal,headers={RSC:'1',authorization:'fixture'},init:RequestInit={headers,signal,credentials:'same-origin',cache:'force-cache'};
 expect(await(await browser.fetch('/nexusflow/chat.txt?_rsc=old',init)).text()).toBe('fresh');
 expect(calls[0]!.init).toMatchObject({cache:'no-store',credentials:'same-origin'});
 expect(calls[0]!.init!.headers).toBe(headers);expect(calls[0]!.init!.signal).toBe(signal);
 const business:RequestInit={method:'POST',headers:{'content-type':'application/json'},body:'{}',cache:'force-cache'};
 await browser.fetch('/nexusflow/api/ai/conversations',business);expect(calls[1]!.init).toBe(business);
 const request=new Request('http://example.test/chat.txt',{headers:{rsc:'1'}});
 expect(await(await browser.fetch(request)).text()).toBe('fresh');expect(calls[2]!.input).toBe(request);
});
