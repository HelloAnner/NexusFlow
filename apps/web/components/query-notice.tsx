"use client";
import { Loading,Empty } from "./ui";
import type { QueryState } from "../lib/query-state";

export function QueryNotice({state,retry,emptyText="暂无数据"}:{state:QueryState<unknown>;retry:()=>unknown;emptyText?:string}){
 if(state.kind==="pending")return <Loading />;
 if(state.kind==="empty")return <Empty text={emptyText} />;
 if(state.kind==="error")return <div role="alert" className="flex flex-col items-center justify-center gap-2 py-14 text-[12.5px] text-ink-4">
  <p className="text-red">数据加载失败：{state.message}</p>
  <button onClick={()=>{void retry();}} className="rounded-sm border border-border px-3 py-1 text-ink-2">重试</button>
 </div>;
 return null;
}
