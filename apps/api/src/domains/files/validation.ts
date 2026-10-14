import type { User } from "../../permissions.ts";
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="files"&&["status","object_key","size_bytes"].some(k=>k in patch))throw new Error("use the file archive or upload action");
}
