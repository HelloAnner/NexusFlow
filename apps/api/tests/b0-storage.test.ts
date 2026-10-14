import { expect,test } from "bun:test";
import { config } from "../src/config.ts";
import { probeStorage } from "../src/storage.ts";
test("storage readiness makes only a signed read-only bucket HEAD",async()=>{
 const previousFetch=globalThis.fetch,previousConfig={...config},calls:{url:string;method:string;body:unknown}[]=[];
 try{
  Object.assign(config,{s3Endpoint:"http://minio.invalid",s3AccessKey:"test",s3SecretKey:"test-only",s3Bucket:"isolated-check"});
  globalThis.fetch=Object.assign(async(...[url,init]:Parameters<typeof fetch>)=>{calls.push({url:String(url),method:init?.method??"GET",body:init?.body});return new Response(null);},{preconnect:previousFetch.preconnect});
  await probeStorage();expect(calls).toHaveLength(1);expect(calls[0]?.method).toBe("HEAD");expect(calls[0]?.body).toBeUndefined();expect(calls[0]?.url).not.toContain("health/");
 }finally{Object.assign(config,previousConfig);globalThis.fetch=previousFetch;}
});
