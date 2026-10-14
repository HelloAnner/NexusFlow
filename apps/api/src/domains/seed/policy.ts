import type { User } from "../../permissions.ts";
export function seedAllowed(user:User,enabled=process.env.DEMO_SEED_ENABLED,tenant=process.env.DEMO_SEED_TENANT_ID):boolean{
 return enabled==="true"&&!!tenant&&/^[a-zA-Z0-9_-]{1,128}$/.test(tenant)&&!["local","production","prod"].includes(tenant.toLowerCase())&&user.tenant_id===tenant&&["super_admin","center_director"].includes(user.role)&&(user.portal_permissions===null||user.portal_permissions.includes("nexusflow:admin"));
}
export function assertSeedAllowed(user:User){if(!seedAllowed(user))throw new Error("forbidden: demo seed requires explicit isolated tenant authorization");}
