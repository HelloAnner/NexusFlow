"use client";

// 静态导出部署在同源 basePath(/nexusflow) 下，API 走相对路径 ./api 或 /nexusflow/api。
export function apiBase(): string {
  if (typeof window === "undefined") return "";
  const p = window.location.pathname;
  if (p === "/nexusflow" || p.startsWith("/nexusflow/")) return "/nexusflow";
  return "";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function token(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nf_token");
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const t = token();
  if (t) headers["authorization"] = `Bearer ${t}`;
  const res = await fetch(`${apiBase()}/api${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    window.location.href = `${apiBase()}/login`;
    throw new ApiError(401, "unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || res.statusText);
  return data as T;
}

import type { ApiRecord } from "../../../packages/shared/src/index";

export type Item = ApiRecord;

export const listItems = (kind: string) => api<{ items: Item[] }>(`/${kind}`).then((r) => r.items || []);
