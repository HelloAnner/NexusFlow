import { sql } from "../../db.ts";
import { getRecord } from "../../records.ts";
import { canProjectAction,type User } from "../../permissions.ts";
import { orgExists,orgDescendant,assignmentOrgAllowed,activeUsers } from "../../shared/record-relations.ts";
export async function validateProjectsCreate(user:User,data:Record<string,any>){
 const kind="projects";
 if(kind==="projects"){if(!await orgExists(user,String(data.org_id||"")))throw new Error("organization unavailable");const assignees=await activeUsers(user,[String(data.owner_id),...(Array.isArray(data.member_ids)?data.member_ids.map(String):[])]);for(const assignee of assignees)if(!await assignmentOrgAllowed(user,assignee.org_id?String(assignee.org_id):null,String(data.org_id),String(assignee.id)))throw new Error("project members must belong to the project organization scope");if(user.org_id&&!['center_director','super_admin'].includes(user.role)&&!await orgDescendant(user,String(data.org_id),user.org_id))throw new Error("project organization is outside your scope");}
}
export async function validateVisibilityGrantsCreate(user:User,data:Record<string,any>){
 const kind="visibility_grants";
 if(kind==="visibility_grants"){const project=await getRecord(user,"projects",String(data.project_id));if(!project)throw new Error("project unavailable");for(const action of data.actions as Array<"view"|"edit">)if(!await canProjectAction(user,String(data.project_id),action))throw new Error("forbidden: cannot grant a project action you do not possess");if(!sql)throw new Error("DATABASE_URL required");const target=await activeUsers(user,[String(data.user_id)]);if(!target.length)throw new Error("grant target user unavailable");data.org_id=project.org_id;}
}
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="projects"&&"status" in patch)throw new Error("use project lifecycle action to change status");
 if(kind==="projects"&&["visibility","member_ids","owner_id"].some(k=>k in patch)&&!['super_admin','center_director','center_deputy','department_director'].includes(user.role))throw new Error("project administration permission required");
}
export async function validateProjectsUpdate(user:User,next:Record<string,any>){
 const kind="projects";
 if(kind==="projects"){if(!await orgExists(user,String(next.org_id||"")))throw new Error("project organization unavailable");const members=await activeUsers(user,[String(next.owner_id),...(Array.isArray(next.member_ids)?next.member_ids.map(String):[])]);for(const assignee of members)if(!await assignmentOrgAllowed(user,assignee.org_id?String(assignee.org_id):null,String(next.org_id),String(assignee.id)))throw new Error("project members must belong to the project organization scope");if(user.org_id&&!['center_director','super_admin'].includes(user.role)&&!await orgDescendant(user,String(next.org_id),user.org_id))throw new Error("project organization is outside your scope");}
}
