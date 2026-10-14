import type { UseQueryResult } from "@tanstack/react-query";

export type QueryState<T> = {kind:"pending"}|{kind:"empty"}|{kind:"error";message:string}|{kind:"ready";items:T[]};
type ListQuery<T> = Pick<UseQueryResult<T[]>,"data"|"isPending"|"isError"|"error">;
export function queryState<T>(query:ListQuery<T>):QueryState<T>{
 if(query.isError)return {kind:"error",message:query.error?.message||"数据加载失败"};
 if(query.isPending||query.data===undefined)return {kind:"pending"};
 if(!Array.isArray(query.data))return {kind:"error",message:"列表数据格式无效"};
 return query.data.length?{kind:"ready",items:query.data}:{kind:"empty"};
}
export function isRecord(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value);}
export function recordQueryState(query:ListQuery<unknown>,label="name"):QueryState<Record<string,unknown>>{
 const state=queryState(query);if(state.kind!=="ready")return state;
 if(!state.items.every(isRecord)||!state.items.every(row=>typeof row.id==="string"&&!!row.id&&typeof row[label]==="string"&&!!row[label]))return {kind:"error",message:"记录缺少有效 ID 或标题"};
 return {kind:"ready",items:state.items};
}
export const measured=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:undefined;
