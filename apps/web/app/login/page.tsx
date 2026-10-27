"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, Eye, EyeOff, AlertTriangle, ExternalLink, LogIn } from "lucide-react";
import { ApiError } from "@/lib/api";
import { absorbPortalToken, useAuth } from "@/lib/auth";
import pkg from "../../package.json";
import { BrandIcon } from "@/components/brand-icon";
import { ThemeToggle } from "@/components/theme-toggle";

const PORTAL_URL = "http://123.57.255.204:6688";
const VERSION = `v${pkg.version}`;

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-10">
      <div className="absolute top-4 right-5">
        <ThemeToggle />
      </div>
      <div className="flex w-[400px] max-w-full flex-col gap-3.5 rounded-lg border border-border bg-panel p-6 pb-5">
        <div className="flex items-center justify-center gap-2">
          <BrandIcon size={30} />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">NexusFlow</span>
        </div>

        <div className="flex flex-col items-center gap-1 pb-1.5 text-center">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">欢迎回来</h1>
          <p className="text-[12.5px] text-ink-3">登录企业项目管理综合系统</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-ink">账号</span>
            <span className="flex items-center gap-2 rounded-[6px] border border-border bg-panel px-2.5 py-1.5 text-ink-3 transition focus-within:border-ink-4">
              <User size={15} />
              <input
                ref={userRef}
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
                placeholder="用户名（可使用企业邮箱格式）"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-ink">密码</span>
            <span className="flex items-center gap-2 rounded-[6px] border border-border bg-panel px-2.5 py-1.5 text-ink-3 transition focus-within:border-ink-4">
              <Lock size={15} />
              <input
                ref={pwdRef}
                type={showPwd ? "text" : "password"}
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
                placeholder="请输入密码"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPwd ? "隐藏密码" : "显示密码"}
                title={showPwd ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPwd((v) => !v)}
                className="shrink-0 text-ink-3 hover:text-ink"
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
          </label>

          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-[11.5px] leading-4 text-red">
              <AlertTriangle size={13} className="mt-px shrink-0" />{error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-1.5 rounded-[6px] bg-ink py-2 text-[13px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-55"
          >
            {loading ? "登录中…" : <><LogIn size={14} /> 登录</>}
          </button>
        </form>

        <div className="flex items-center gap-2.5 text-[11.5px] text-ink-3">
          <span className="h-px flex-1 bg-border" />或从门户进入<span className="h-px flex-1 bg-border" />
        </div>

        <p className="text-center text-[12.5px] text-ink-3">
          从 Portal 门户免密进入 ·{" "}
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-ink hover:underline"
          >
            打开门户 <ExternalLink size={11} />
          </a>
        </p>
      </div>

      <footer className="mt-5 text-center text-[11.5px] leading-5 text-ink-3">
        {VERSION} · 环境 {env || "—"}
        {next ? <> · 登录后返回 {next}</> : null}
      </footer>
    </main>
  );
}
