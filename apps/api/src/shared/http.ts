import type { Hono } from "hono";
import type { User } from "../permissions.ts";
export type ApiEnv={Bindings:{remoteAddress?:string|null};Variables:{user:User;request_id:string}};
export type ApiApp=Hono<ApiEnv>;
export const systemVersion=()=>({service:"nexusflow",version:process.env.NEXUSFLOW_BUILD_COMMIT||"unknown",...(process.env.NEXUSFLOW_BUILD_TIME?{build_time:process.env.NEXUSFLOW_BUILD_TIME}:{})});
export function errorStatus(error:Error):400|403|404|409|500{
 if(error.name==="ZodError"||error instanceof SyntaxError)return 400;
 const m=error.message;
 return m.includes("forbidden")?403:m.includes("not found")||m.includes("unavailable")?404:m.includes("already")||m.includes("no longer")||m.includes("locked")||m.includes("changed")||m.includes("still")||m.includes("workflow")?409:m.includes("required")||m.includes("invalid")||m.includes("cannot")||m.includes("must")||m.includes("not enabled")?400:500;
}
