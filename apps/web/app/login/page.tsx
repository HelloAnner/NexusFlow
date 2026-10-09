"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, Eye, EyeOff, Check, AlertTriangle, ExternalLink, LogIn } from "lucide-react";
import { ApiError } from "@/lib/api";
import { absorbPortalToken, useAuth } from "@/lib/auth";
import pkg from "../../package.json";

const PORTAL_URL = "http://123.57.255.204:6688";
const VERSION = `v${pkg.version}`;

const CAPABILITIES = [
  "任务派发与分级审批：标准/后补流程，部门主任到中心主任逐级签批",
  "负载与冲突：按人按日测算投入，全天锁定与冲突预警",
  "甘特与资料：150 天项目甘特、版本留痕的资源库",
  "首页指挥台：待办、风险、项目脉搏、团队负载一屏可见",
];

/** 只允许站内相对路径：先用 URL 归一化（处理 %5C / \ 等编码回退），再拦一次 `//`，避免开放跳转。 */
function safeNext(v: string | null): string {
  if (!v) return "";
  try {
    const u = new URL(v, window.location.origin);
    if (u.origin !== window.location.origin) return "";
    const path = u.pathname + u.search + u.hash;
    if (path.startsWith("//")) return "";
    // 下游（Next / 浏览器）会再归一化一次，解码后若变成协议相对地址或含反斜杠/控制字符则一律拒绝。
    const decoded = decodeURIComponent(u.pathname);
    if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001F\u007F]/.test(decoded)) return "";
    return path;
  } catch {
    return "";
  }
}

function loginError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "用户名或密码错误";
    if (err.status === 503) return "认证服务不可用，请稍后重试";
    if (err.status === 403) return err.message.includes("portal") ? "本地登录已禁用，请从 Portal 门户免密进入" : "当前账号无本地登录权限";
    if (err.status === 400) return "用户名或密码格式不合法";
    return `登录失败（${err.status}）`;
  }
  return "无法连接服务器，请检查网络后重试";
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const fetchMe = useAuth((s) => s.fetchMe);

  const [next, setNext] = useState("");
  const [env, setEnv] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const userRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);

  // 会话检查在后台进行，不阻塞首帧：首帧直接就渲染品牌面板 + 表单（静态导出 HTML 含表单）。
  // 命中已有会话（本地 token 或 nf_session Cookie，含 Portal 落地）时再跳 ?next= 或 /。
  useEffect(() => {
    absorbPortalToken();
    const params = new URLSearchParams(window.location.search);
    const target = safeNext(params.get("next"));
    setNext(target);
    const host = window.location.hostname;
    setEnv(host === "localhost" || host === "127.0.0.1" ? "localhost" : window.location.host);
    let alive = true;
    fetchMe().then((u) => {
      if (alive && u) router.replace(target || "/");
    });
    return () => { alive = false; };
  }, [fetchMe, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim()) {
      setError("请输入用户名");
      userRef.current?.focus();
      return;
    }
    if (!password) {
      setError("请输入密码");
      pwdRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace(next || "/");
    } catch (err) {
      setError(loginError(err));
      setLoading(false);
      pwdRef.current?.focus();
      pwdRef.current?.select();
    }
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* 品牌面板（窄屏隐藏） */}
      <aside className="hidden w-[420px] shrink-0 flex-col justify-between bg-[#1F2329] px-10 py-10 text-white lg:w-[480px] md:flex">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 2.5 L20 7 v10 L12 21.5 L4 17 V7 Z" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <div className="text-[15px] font-semibold tracking-tight">NexusFlow</div>
              <div className="text-[11.5px] text-white/55">企业项目管理综合系统</div>
            </div>
          </div>
          <h1 className="mt-9 text-[22px] leading-9 font-semibold">
            把任务、排程、负载与审批<br />收进同一张指挥台
          </h1>
          <ul className="mt-7 flex flex-col gap-3">
            {CAPABILITIES.map((c) => (
              <li key={c} className="flex gap-2.5 text-[12.5px] leading-5 text-white/70">
                <Check size={14} className="mt-[3px] shrink-0 text-[#5B9BFF]" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[11.5px] leading-5 text-white/45">
          {VERSION} · 环境 {env || "—"}
        </div>
      </aside>

      {/* 表单列 */}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-[360px] max-w-full rounded-xl border border-border bg-panel p-8">
          <div className="mb-6 flex flex-col items-center gap-2.5 md:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ink text-panel">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 2.5 L20 7 v10 L12 21.5 L4 17 V7 Z" strokeLinejoin="round" />
              </svg>
            </span>
            <h1 className="text-[17px] font-semibold text-ink">NexusFlow</h1>
            <p className="text-[12px] text-ink-3">企业项目管理综合系统</p>
          </div>

          <div className="mb-5 hidden md:block">
            <h2 className="text-[18px] font-semibold text-ink">登录</h2>
            <p className="mt-1 text-[12px] text-ink-3">使用本地账号进入工作台</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex h-9 items-center gap-2 rounded-sm border border-border px-3 focus-within:border-accent">
              <User size={14} className="text-ink-3" />
              <input
                ref={userRef}
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-4"
                placeholder="用户名"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="flex h-9 items-center gap-2 rounded-sm border border-border px-3 focus-within:border-accent">
              <Lock size={14} className="text-ink-3" />
              <input
                ref={pwdRef}
                type={showPwd ? "text" : "password"}
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-4"
                placeholder="密码"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPwd ? "隐藏密码" : "显示密码"}
                title={showPwd ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPwd((v) => !v)}
                className="shrink-0 text-ink-3 hover:text-ink-2"
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </label>

            {error && (
              <p role="alert" className="flex items-start gap-1.5 text-[12px] leading-5 text-red">
                <AlertTriangle size={13} className="mt-[4px] shrink-0" />{error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-sm bg-accent text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "登录中…" : <><LogIn size={14} /> 登录</>}
            </button>
          </form>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[11.5px] leading-5 text-ink-3">
              也可从 Portal 门户免密进入，无需在本页输入密码。
            </p>
            <a
              href={PORTAL_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline"
            >
              {PORTAL_URL} <ExternalLink size={11} />
            </a>
          </div>
        </div>

        <footer className="mt-6 text-center text-[11px] leading-5 text-ink-4">
          {VERSION} · NexusFlow · 企业项目管理系统
          <br />
          当前环境：{env || "—"}
          {next ? <><br />登录后返回 {next}</> : null}
        </footer>
      </main>
    </div>
  );
}
