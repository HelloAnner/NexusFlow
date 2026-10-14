import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { canManage,actor } from "../../permissions.ts";
import { listRecords } from "../../records.ts";
import { loadList,personLoad } from "./service.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/load/:personId",async c=>{const user=actor(c),id=c.req.param("personId"),people=await listRecords(user,"people"),profile=people.find(p=>p.id===id||p.user_id===id);if(!profile)return c.json({error:"person not found"},404);if(!canManage(user)&&profile.user_id!==user.id)return c.json({error:"forbidden"},403);return c.json(await personLoad(user,id,c.req.query("date")));});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["load"],loadList);}
