"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { Modal, Field, inputCls, errorText } from "@/components/feedback";
import { api } from "@/lib/api";
import { useData } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { copyToClipboard } from "@/lib/clipboard";
import { roleLabel } from "@/lib/home";

type Invitation = { id: string; org_id: string; role: string; status: string; expires_at: string };
const buttonCls = "h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink disabled:opacity-40";

export function MemberInvitations({ orgs }: { orgs: { id: string; name: string }[] }) {
  const records = useData<Invitation[]>("member-invitations", "/invitations");
  const user = useAuth((state) => state.user);
  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("member");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const roles = ["member", "project_lead", ...(["super_admin", "center_director"].includes(user?.role ?? "") ? ["department_deputy", "department_director", "center_deputy"] : [])];
  const copy = async (url: string) => setMessage(await copyToClipboard(url) ? "邀请链接已复制，可以发送给受邀人。" : "自动复制失败，请点击复制按钮，或选中链接手动复制。");
  const generate = async (id?: string) => {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ invite_url: string }>(id ? `/invitations/${id}/resend` : "/invitations", { method: "POST", body: JSON.stringify(id ? {} : { org_id: org, role, expires_at: new Date(Date.now() + days * 86400000).toISOString() }) });
      const url = new URL(result.invite_url, location.origin).href;
      setLink(url); setOpen(true);
      await copy(url);
      await records.refetch();
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    if (!confirm("撤销此邀请？原链接将立即失效。")) return;
    setBusy(true);
    try { await api(`/invitations/${id}/revoke`, { method: "POST", body: "{}" }); setLink(""); await records.refetch(); setMessage("邀请已撤销"); }
    catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  return <>
    <section className="mb-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-semibold text-ink">成员邀请</h2><button type="button" className={buttonCls} disabled={busy} onClick={() => { setOpen(true); setLink(""); setMessage(""); }}>邀请成员</button></div>
      <p className="mb-3 text-[12px] text-ink-3">生成一次性注册链接，邀请新成员加入指定部门；重发会使旧链接失效。</p>
      {!open && message && <p role="status" className="mb-3 text-[12px] text-ink-2">{message}</p>}
      <Card className="overflow-x-auto"><table className="w-full text-left text-[12px] text-ink-2"><thead><tr className="border-b border-border"><th className="p-3">部门 / 角色</th><th>到期时间</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {(records.data ?? []).map((invite) => { const status = invite.status === "active" && Date.parse(invite.expires_at) <= Date.now() ? "expired" : invite.status; return <tr key={invite.id} className="border-b border-border last:border-0">
          <td className="p-3">{orgs.find((item) => item.id === invite.org_id)?.name ?? "部门"} · {roleLabel(invite.role)}</td><td>{new Date(invite.expires_at).toLocaleString()}</td><td>{{ active: "待接受", expired: "已过期", revoked: "已撤销", used: "已接受" }[status] ?? status}</td>
          <td><button type="button" className={buttonCls} disabled={busy || status === "used"} onClick={() => void generate(invite.id)}>重发并复制</button> <button type="button" className={buttonCls} disabled={busy || status !== "active"} onClick={() => void revoke(invite.id)}>撤销</button></td>
        </tr>; })}
      </tbody></table>{records.isPending ? <p className="p-3 text-[12px] text-ink-3">加载中…</p> : records.isError ? <p role="alert" className="p-3 text-[12px] text-red">{errorText(records.error)}</p> : !records.data?.length && <p className="p-3 text-[12px] text-ink-3">暂无邀请</p>}</Card>
    </section>
    <Modal open={open} title="邀请成员" onClose={() => { if (!busy) setOpen(false); }}>
      {link ? <div className="flex flex-col gap-3"><Field label="邀请链接"><input className={inputCls} aria-label="邀请链接" value={link} readOnly onClick={(event) => event.currentTarget.select()} /></Field><button type="button" className={buttonCls} onClick={() => void copy(link)}>复制邀请链接</button><p className="text-[12px] text-ink-3">链接只在创建或重发时展示，发送给受邀人后由对方注册加入。</p></div> : <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <Field label="部门"><select className={inputCls} required value={org} onChange={(event) => setOrg(event.target.value)}><option value="">选择部门</option>{orgs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="角色"><select className={inputCls} value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></Field>
        <Field label="有效期（天）"><input className={inputCls} type="number" min={1} max={30} required value={days} onChange={(event) => setDays(Number(event.target.value))} /></Field>
        <button type="submit" className={buttonCls} disabled={busy || !org}>{busy ? "生成中…" : "生成并复制邀请链接"}</button>
      </form>}
      <p role="status" aria-live="polite" className="mt-3 text-[12px] text-ink-2">{message}</p>
    </Modal>
  </>;
}
