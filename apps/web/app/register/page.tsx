"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, apiBase } from "@/lib/api";
import { BrandIcon } from "@/components/brand-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Field, inputCls, errorText } from "@/components/feedback";
import { roleLabel } from "@/lib/home";

const tokenKey = "nf_invitation_token";
type Details = { valid: boolean; role?: string; org_name?: string; expires_at?: string };

export default function RegisterPage() {
  const [token, setToken] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const incoming = new URLSearchParams(location.hash.slice(1)).get("token");
    const value = incoming ?? sessionStorage.getItem(tokenKey) ?? "";
    if (incoming) { sessionStorage.setItem(tokenKey, incoming); history.replaceState(null, "", location.pathname); }
    setToken(value);
    if (!value) { setError("邀请链接缺少凭据，请向管理员获取完整链接。"); return; }
    api<Details>("/auth/invitations/validate", { method: "POST", body: JSON.stringify({ token: value }) })
      .then((result) => { setDetails(result); if (!result.valid) { sessionStorage.removeItem(tokenKey); setError("邀请已过期、已撤销或已被使用，请联系管理员重发。"); } })
      .catch((reason) => setError(errorText(reason)));
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ access_token: string }>("/auth/register", { method: "POST", body: JSON.stringify({ username: username.trim(), display_name: name.trim(), password, invitation_token: token }) });
      localStorage.setItem("nf_token", result.access_token);
      sessionStorage.removeItem(tokenKey);
      location.replace(`${apiBase()}/`);
    } catch (reason) { setError(errorText(reason)); setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
    <div className="absolute right-5 top-4"><ThemeToggle /></div>
    <section className="flex w-[440px] max-w-full flex-col gap-4 rounded-lg border border-border bg-panel p-6">
      <div className="flex items-center gap-2"><BrandIcon size={28} /><strong>NexusFlow</strong></div>
      <h1 className="text-[18px] font-semibold text-ink">注册并加入企业空间</h1>
      {details?.valid && <p className="text-[12px] text-ink-3">{details.org_name} · {roleLabel(details.role ?? "member")} · 有效至 {new Date(details.expires_at!).toLocaleString()}</p>}
      {error && <p role="alert" className="text-[12px] text-red">{error}</p>}
      {!details && !error && <p role="status" className="text-[12px] text-ink-3">正在校验邀请…</p>}
      {details?.valid && <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="账号"><input className={inputCls} autoComplete="username" required pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}" minLength={3} maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3–64 位字母、数字、点、下划线或短横线" /></Field>
        <Field label="姓名"><input className={inputCls} autoComplete="name" required maxLength={128} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="密码"><input className={inputCls} type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 位" /></Field>
        <button disabled={busy || !token} type="submit" className="h-9 rounded-sm bg-ink text-[13px] text-canvas disabled:opacity-50">{busy ? "正在加入…" : "注册并加入"}</button>
      </form>}
      <Link href="/login" className="text-center text-[12px] text-ink-3 underline">已有账号？返回登录</Link>
    </section>
  </main>;
}
