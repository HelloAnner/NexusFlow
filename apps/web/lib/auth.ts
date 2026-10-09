"use client";

import { create } from "zustand";
import { api, apiBase } from "./api";

export type SessionUser = { id: string; username: string; name: string; role: string };

type AuthState = {
  user: SessionUser | null;
  checked: boolean;
  setUser: (u: SessionUser | null) => void;
  fetchMe: () => Promise<SessionUser | null>;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  checked: false,
  setUser: (user) => set({ user, checked: true }),
  fetchMe: async () => {
    try {
      const me = await api<{ id: string; username: string; role: string }>("/auth/me");
      const user: SessionUser = {
        id: me.id,
        username: me.username,
        name: me.username,
        role: me.role,
      };
      set({ user, checked: true });
      return user;
    } catch {
      set({ user: null, checked: true });
      return null;
    }
  },
  login: async (username, password) => {
    const res = await api<{ access_token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem("nf_token", res.access_token);
    set({ user: res.user, checked: true });
    return res.user;
  },
  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    localStorage.removeItem("nf_token");
    set({ user: null, checked: true });
    window.location.href = `${apiBase()}/login`;
  },
}));

// Portal 回调会带 ?token=，落地一次后清掉 URL。
export function absorbPortalToken() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const t = url.searchParams.get("token");
  if (t) {
    localStorage.setItem("nf_token", t);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
}
