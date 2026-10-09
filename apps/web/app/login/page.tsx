"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace("/");
    } catch {
      setError("用户名或密码错误");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="w-[340px] rounded-xl border border-border bg-panel p-8">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ink text-panel">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2.5 L20 7 v10 L12 21.5 L4 17 V7 Z" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="text-[17px] font-semibold text-ink">NexusFlow</h1>
          <p className="text-[12px] text-ink-3">企业项目管理综合系统</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex h-9 items-center gap-2 rounded-sm border border-border px-3 focus-within:border-accent">
            <User size={14} className="text-ink-3" />
            <input
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-4"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </label>
          <label className="flex h-9 items-center gap-2 rounded-sm border border-border px-3 focus-within:border-accent">
            <Lock size={14} className="text-ink-3" />
            <input
              type="password"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-4"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-[12px] text-red">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 h-9 rounded-sm bg-accent text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "登录中…" : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
