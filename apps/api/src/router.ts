import { Hono } from "hono";
import { probeDependencies } from "./db.ts";
import { currentUser,login,logout,register,portalCallback,portalAllows } from "./auth.ts";
import { actor } from "./permissions.ts";
import { probeStorage } from "./storage.ts";
import { auditContext,sourceIp } from "./shared/audit.ts";
import { systemVersion,errorStatus } from "./shared/http.ts";
import { type ApiEnv } from "./shared/http.ts";
import { listDto } from "../../../packages/shared/src/contracts.ts";
const app=new Hono<ApiEnv>();
import { registerRoutes as registerOrg,registerRecords as registerOrgRecords } from "./domains/org/routes.ts";
import { registerRoutes as registerPeople,registerRecords as registerPeopleRecords } from "./domains/people/routes.ts";
import { registerRoutes as registerProjects,registerRecords as registerProjectsRecords } from "./domains/projects/routes.ts";
import { registerRoutes as registerTasks,registerRecords as registerTasksRecords } from "./domains/tasks/routes.ts";
import { registerRoutes as registerDispatch,registerRecords as registerDispatchRecords } from "./domains/dispatch/routes.ts";
import { registerRoutes as registerApprovals,registerRecords as registerApprovalsRecords } from "./domains/approvals/routes.ts";
import { registerRoutes as registerLoad,registerRecords as registerLoadRecords } from "./domains/load/routes.ts";
import { registerRoutes as registerConflicts,registerRecords as registerConflictsRecords } from "./domains/conflicts/routes.ts";
import { registerRoutes as registerFiles,registerRecords as registerFilesRecords } from "./domains/files/routes.ts";
import { registerPortalFiles,portalFilesPublicPath } from "./domains/files/portal.ts";
import { registerPortalFileLinks } from "./domains/files/portal-links.ts";
import { registerRoutes as registerHome,registerRecords as registerHomeRecords } from "./domains/home/routes.ts";
import { registerRoutes as registerConfig,registerRecords as registerConfigRecords } from "./domains/config/routes.ts";
import { registerRoutes as registerInbox,registerRecords as registerInboxRecords } from "./domains/inbox/routes.ts";
import { registerRoutes as registerReports,registerRecords as registerReportsRecords } from "./domains/reports/routes.ts";
import { registerRoutes as registerTools,registerRecords as registerToolsRecords } from "./domains/tools/routes.ts";
import { registerRoutes as registerAdmin,registerRecords as registerAdminRecords } from "./domains/admin/routes.ts";
import { registerRoutes as registerSeed,registerRecords as registerSeedRecords } from "./domains/seed/routes.ts";
import { registerRoutes as registerGantt,registerRecords as registerGanttRecords } from "./domains/gantt/routes.ts";
import { registerPortalSync } from "./domains/portal_sync.ts";
import { registerRbac } from "./rbac.ts";
import { withRbacContext } from "./rbac.ts";
app.use("*",async(c,next)=>{
 const supplied=c.req.header("x-request-id"),request_id=supplied&&/^[a-zA-Z0-9._-]{1,128}$/.test(supplied)?supplied:crypto.randomUUID();
 c.set("request_id",request_id);c.header("x-request-id",request_id);
 return auditContext.run({request_id,source_ip:sourceIp(c.env?.remoteAddress??null,c.req.raw.headers)},async()=>{
  await next();
  if(c.req.path.startsWith("/api/")&&c.res.headers.get("content-type")?.includes("application/json")){
   const body=await c.res.clone().json();
   if(body&&typeof body==="object"&&"error" in body){c.res=Response.json({...body,code:body.code||`HTTP_${c.res.status}`,request_id},{status:c.res.status,headers:c.res.headers});}
   else if(body&&Array.isArray(body.items)&&!("total" in body)){c.res=Response.json({...body,...listDto(body.items,c.req.query())},{status:c.res.status,headers:c.res.headers});}
  }
 });
});
const publicPaths=new Set(["/api/auth/login","/api/auth/logout","/api/auth/register"]);
app.use("/api/*",async(c,next)=>{if(publicPaths.has(c.req.path)||c.req.path.startsWith("/api/portal/sync/v1")||c.req.path.startsWith("/api/portal/rbac/v1")||c.req.path==="/api/system/version"&&c.req.method==="GET"||portalFilesPublicPath.test(c.req.path))return next();const loadedUser=await currentUser(c);if(!loadedUser)return c.json({error:"unauthorized"},401);const user=await withRbacContext(loadedUser);
 const registered=app.routes.some(route=>!route.path.includes("*")&&(route.method===c.req.method||route.method==="ALL")&&new RegExp("^"+route.path.replace(/:[^/]+/g,"[^/]+")+"$").test(c.req.path));
 if(!registered)return c.json({error:"not found"},404);
 if(!portalAllows(user,c.req.path,c.req.method))return c.json({error:"forbidden"},403);c.set("user",user);await next();});
app.onError((e,c)=>{const status=errorStatus(e);return c.json({error:status===500?"internal error":e.message,code:`HTTP_${status}`,request_id:c.get("request_id")},status);});
app.get("/api/system/version",c=>c.json(systemVersion()));
app.get("/healthz",c=>c.json({ok:true,...systemVersion()}));
app.get("/readyz",async c=>{try{await probeDependencies();await probeStorage();return c.json({ok:true,read_only:true,database:true,redis:true,object_storage:true});}catch{return c.json({ok:false,read_only:true,error:"dependencies unavailable"},503);}});
app.post("/api/auth/login",login);app.post("/api/auth/register",register);app.post("/api/auth/logout",logout);app.get("/api/auth/me",c=>c.json(actor(c)));app.get("/auth/portal/callback",portalCallback);

registerOrg(app);
registerPeople(app);
registerProjects(app);
registerTasks(app);
registerDispatch(app);
registerApprovals(app);
// Static /api/load/conflicts must precede /api/load/:personId.
registerConflicts(app);
registerLoad(app);
registerFiles(app);
registerPortalFiles(app);
registerPortalFileLinks(app);
registerHome(app);
registerConfig(app);
registerInbox(app);
registerReports(app);
registerTools(app);
registerAdmin(app);
registerSeed(app);
registerGantt(app);
registerPortalSync(app);
registerRbac(app);
registerOrgRecords(app);
registerPeopleRecords(app);
registerProjectsRecords(app);
registerTasksRecords(app);
registerDispatchRecords(app);
registerApprovalsRecords(app);
registerLoadRecords(app);
registerConflictsRecords(app);
registerFilesRecords(app);
registerHomeRecords(app);
registerConfigRecords(app);
registerInboxRecords(app);
registerReportsRecords(app);
registerToolsRecords(app);
registerAdminRecords(app);
registerSeedRecords(app);
registerGanttRecords(app);
app.all("/api/*",c=>c.json({error:"not found"},404));
// Static export files are embedded at build time; no path can escape the asset map.
import { webAssets } from "./web-assets.generated.ts";
app.get("*",c=>{let path=decodeURIComponent(c.req.path);if(path==="/")path="/index.html";let asset=path.replace(/^\//,"");if(!asset.includes(".")){if(webAssets[`${asset}.html`])asset=`${asset}.html`;else if(webAssets[`${asset}/index.html`])asset=`${asset}/index.html`;else asset="index.html";}const encoded=webAssets[asset];if(!encoded)return c.text("Not found",404);const bytes=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));const ext=asset.split(".").pop()?.toLowerCase();const type=ext==="html"?"text/html; charset=utf-8":ext==="js"?"text/javascript":ext==="css"?"text/css":ext==="txt"?"text/x-component":ext==="json"?"application/json":ext==="svg"?"image/svg+xml":ext==="png"?"image/png":ext==="jpg"||ext==="jpeg"?"image/jpeg":ext==="webp"?"image/webp":ext==="ico"?"image/x-icon":ext==="woff2"?"font/woff2":"application/octet-stream";return new Response(bytes,{headers:{"content-type":type,"cache-control":ext==="html"?"no-cache":"public, max-age=31536000, immutable"}});});


export default app;
