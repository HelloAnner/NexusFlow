import { getAction } from './repository.ts';
import { toolSpecs,toolAvailable } from './catalog.ts';
import { permissionStamp,type Runtime } from './transport.ts';
import { snapshot } from './operations.ts';
export async function visibleAction(runtime:Runtime,id:string){
 const action=await getAction(runtime.user,id),spec=toolSpecs.find(s=>s.name===action.tool);
 if(!spec||!toolAvailable(runtime.user,spec)||action.permission_stamp!==permissionStamp(runtime.user))throw Error('forbidden: action scope changed');
 // 已删除的对象不能回读；删除前的快照只向同一权限范围的原操作人显示。
 if(spec.method!=='DELETE')await snapshot(runtime,spec,action.args);
 return action;
}
