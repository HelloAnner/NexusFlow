import { expect,test } from "bun:test";
import { allowedAction,canReadRecord,canWriteRecord,type User } from "../src/permissions.ts";
import { calculateDailyLoads,validateRange } from "../src/load.ts";
import { portalAllows } from "../src/auth.ts";
const member:User={id:"u1",username:"one",role:"member",tenant_id:"t1",org_id:"o1",portal_permissions:null};
test("authorization blocks cross-tenant and unrelated personal records",async()=>{
 expect(await canReadRecord(member,"tasks",{tenant_id:"t2",created_by:"u1",data:{owner_id:"u1"}})).toBe(false);
 expect(await canReadRecord(member,"tasks",{tenant_id:"t1",created_by:"u2",data:{owner_id:"u2"}})).toBe(false);
 const department={...member,role:"department_director"};
 expect(await canReadRecord(department,"tasks",{tenant_id:"t1",created_by:"u2",data:{org_id:"other",owner_id:"u2"}})).toBe(false);
 expect(await canReadRecord(department,"projects",{tenant_id:"t1",created_by:"u2",data:{id:"hidden",org_id:"o1",visibility:"hidden",owner_id:"u2"}})).toBe(false);
 expect(await canReadRecord(member,"config",{tenant_id:"t1",created_by:"u1",data:{}})).toBe(false);
 expect(allowedAction(member,"config","write")).toBe(false);
 expect(await canWriteRecord(member,"projects",{tenant_id:"t1",created_by:"u1",data:{}},"create")).toBe(false);
});
test("portal ticket scopes are enforced even for elevated local roles",()=>{
 const portalUser={...member,role:"center_director",portal_permissions:[]};
 expect(portalAllows(portalUser,"/api/admin/audit","GET")).toBe(false);
 expect(portalAllows({...portalUser,portal_permissions:["nexusflow:admin"]},"/api/admin/audit","GET")).toBe(true);
 expect(portalAllows(member,"/api/tasks","GET")).toBe(true);
});
test("daily load overlaps only on matching dates and validates calendar dates",()=>{
 const tasks=[{id:"a",status:"in_progress",owner_id:"u1",start_date:"2026-06-01",end_date:"2026-06-02",daily_hours:5},{id:"b",status:"in_progress",owner_id:"u1",start_date:"2026-06-03",end_date:"2026-06-04",daily_hours:5}];
 expect(calculateDailyLoads(tasks,["u1"],"2026-06-01","2026-06-04").every(x=>!x.overloaded)).toBe(true);
 expect(calculateDailyLoads(tasks,["u1"],"2026-06-01","2026-06-04",{u1:4}).some(x=>x.overloaded)).toBe(true);
 tasks[1]!.start_date="2026-06-02";expect(calculateDailyLoads(tasks,["u1"],"2026-06-01","2026-06-04").some(x=>x.overloaded)).toBe(true);
 expect(validateRange("2026-02-30","2026-03-01")).toBe(false);expect(validateRange("apple","zebra")).toBe(false);
});
