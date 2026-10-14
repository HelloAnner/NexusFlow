import { expect,test } from "bun:test";
import { queryState,recordQueryState,measured } from "../../web/lib/query-state.ts";
import { projectPlanState } from "../../web/lib/plan-data.ts";
import type { GanttGroup } from "../../web/lib/demo.ts";

const pending={data:undefined,isPending:true,isError:false,error:null};
const success=(data:unknown[])=>({data,isPending:false,isError:false,error:null});
test("undefined/disabled queries wait; only successful empty arrays are empty; errors beat old data",()=>{
 expect(queryState(pending)).toEqual({kind:"pending"});
 expect(queryState({...pending,isPending:false})).toEqual({kind:"pending"});
 expect(queryState(success([]))).toEqual({kind:"empty"});
 expect(recordQueryState({...success([]),isError:true,error:new Error("API unavailable")})).toEqual({kind:"error",message:"API unavailable"});
 expect(recordQueryState({...success([{id:"live",name:"Live"}]),isError:true,error:new Error("stale session")})).toEqual({kind:"error",message:"stale session"});
 for(const data of [[null],[{}],[{id:"",name:"Missing ID"}],[{id:"live",name:{bad:true}}]])expect(recordQueryState(success(data)).kind).toBe("error");
 expect(recordQueryState(success([{id:"live",name:"Live"}]))).toEqual({kind:"ready",items:[{id:"live",name:"Live"}]});
 expect(measured(undefined)).toBeUndefined();expect(measured("68")).toBeUndefined();expect(measured(0)).toBe(0);
});
test("project plan never finds in undefined data or selects an unrelated project/demo",()=>{
 const projects=recordQueryState(success([{id:"live-project",name:"Live",start_date:"2026-06-01",end_date:"2026-06-03"}]));
 const loading=queryState(pending),empty=queryState(success([]));
 expect(projectPlanState("live-project",recordQueryState(pending),loading)).toEqual({kind:"pending"});
 expect(projectPlanState("missing",projects,loading)).toEqual({kind:"empty",message:"项目不存在或不可见"});
 expect(projectPlanState("live-project",projects,loading)).toEqual({kind:"pending"});
 expect(projectPlanState("live-project",projects,empty)).toEqual({kind:"empty",message:"暂无项目任务"});
 const failure=queryState({...pending,isPending:false,isError:true,error:new Error("endpoint not found")});
 expect(projectPlanState("live-project",projects,failure)).toEqual({kind:"error",message:"endpoint not found"});
 const group:GanttGroup={type:"research",typeColor:"#878C94",owner:"real-owner",ownerColor:"#878C94",tasks:[{id:"real-task",name:"Real task",start:0,end:2,kind:"plan"}]};
 const ready=projectPlanState("live-project",projects,queryState(success([group])));
 expect(ready.kind).toBe("ready");if(ready.kind!=="ready")throw Error("expected real ready plan");
 expect(ready.project.id).toBe("live-project");expect(ready.groups).toEqual([group]);expect(ready.start).toBe("2026-06-01");expect(ready.days).toBe(2);
 for(const data of [[{name:"flat task"}],[{...group,tasks:undefined}],[{...group,tasks:[null]}],[{...group,tasks:[{...group.tasks[0],start:NaN}]}],[{...group,tasks:[{...group.tasks[0],popover:{}}]}]])expect(projectPlanState("live-project",projects,queryState(success(data))).kind).toBe("error");
 expect(projectPlanState("live-project",projects,queryState(success([{...group,tasks:[]}])))).toEqual({kind:"empty",message:"暂无项目任务"});
 expect(projectPlanState("live-project",recordQueryState(success([{id:"live-project",name:"Live"}])),queryState(success([group]))).kind).toBe("error");
});
