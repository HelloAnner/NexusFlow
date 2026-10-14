"use client";
import { useSyncExternalStore } from "react";
import { useQuery,type UseQueryResult } from "@tanstack/react-query";
import { unwrapList } from "../../../packages/shared/src/contracts";
import { api,sessionEpoch,sessionTenant,subscribeSession } from "./api";
import { useAuth } from "./auth";
// Third argument is temporarily source-compatible only. Page-owned fallbacks remain pending.
export function useData<T>(key:string,path:string,_legacyDemo?:T):UseQueryResult<T>{
 const user=useAuth(state=>state.user),checked=useAuth(state=>state.checked);
 const epoch=useSyncExternalStore(subscribeSession,sessionEpoch,()=>0);
 return useQuery<T>({
  queryKey:["data",user?.id??null,sessionTenant(),epoch,key,path],
  queryFn:async()=>unwrapList<unknown>(await api<unknown>(path)) as unknown as T,
  enabled:checked&&!!user,staleTime:30_000,
 });
}
