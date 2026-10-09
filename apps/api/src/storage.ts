import { config } from "./config.ts";
const enc=new TextEncoder();
export const awsUriEncode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function s3ObjectPath(prefix:string,bucket:string,key:string){return `${prefix.replace(/\/$/,"")}/${awsUriEncode(bucket)}/${key.split("/").map(awsUriEncode).join("/")}`;}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
async function hash(value:string|Uint8Array) { return hex(await crypto.subtle.digest("SHA-256",typeof value==="string"?enc.encode(value):(value.slice().buffer as ArrayBuffer))); }
async function hmac(key:Uint8Array|string,value:string) { const cryptoKey=await crypto.subtle.importKey("raw",typeof key==="string"?enc.encode(key):(key.slice().buffer as ArrayBuffer),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,enc.encode(value))); }
async function signingKey(date:string) { const kDate=await hmac(`AWS4${config.s3SecretKey}`,date);const region=await hmac(kDate,config.s3Region);const service=await hmac(region,"s3");return hmac(service,"aws4_request"); }
export async function objectRequest(method:"PUT"|"GET"|"DELETE",key:string,body?:Uint8Array,contentType="application/octet-stream") {
 if(!config.s3Endpoint||!config.s3AccessKey||!config.s3SecretKey||!config.s3Bucket)throw new Error("S3 storage is not configured");
 const endpoint=new URL(config.s3Endpoint);const path=s3ObjectPath(endpoint.pathname,config.s3Bucket,key);const url=new URL(path,endpoint.origin);const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,"");const day=date.slice(0,8);const payload=body?await hash(body):await hash("");
 const headers=new Headers({host:url.host,"x-amz-content-sha256":payload,"x-amz-date":date});if(method==="PUT")headers.set("content-type",contentType);
 const names=[...headers.keys()].map(x=>x.toLowerCase()).sort();const canonicalHeaders=names.map(n=>`${n}:${headers.get(n)!.trim()}\n`).join("");const signed=names.join(";");const canonical=[method,url.pathname,"",canonicalHeaders,signed,payload].join("\n");const scope=`${day}/${config.s3Region}/s3/aws4_request`;const toSign=["AWS4-HMAC-SHA256",date,scope,await hash(canonical)].join("\n");const signature=hex(await crypto.subtle.sign("HMAC",await crypto.subtle.importKey("raw",await signingKey(day),{name:"HMAC",hash:"SHA-256"},false,["sign"]),enc.encode(toSign)));
 headers.set("authorization",`AWS4-HMAC-SHA256 Credential=${config.s3AccessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`);
 const response=await fetch(url,{method,headers,body:body as BodyInit|undefined,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`object storage ${method} failed (${response.status})`);return response;
}
export async function probeStorage(){const key=`health/${crypto.randomUUID()}`;await objectRequest("PUT",key,enc.encode("ok"),"text/plain");await objectRequest("DELETE",key);}
