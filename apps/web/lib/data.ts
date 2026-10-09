"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "./api";

// API 优先；失败时回退到 demo（与设计稿一致的数据），保证页面可用。
export function useData<T>(key: string, path: string, demo: T): UseQueryResult<T> {
  const options = {
    queryKey: [key],
    queryFn: () => api<T>(path).catch(() => demo),
    initialData: demo,
    staleTime: 30_000,
  };
  return useQuery(options as never) as UseQueryResult<T>;
}
