"use client";

import React, { useState } from "react";
import {
  Building2, Users2, UserPlus, ChevronRight,
} from "lucide-react";
import {
  Card, Badge, Avatar, Bar, PageHeader, SearchBox,
  Empty, STATUS_COLOR,
} from "@/components/ui";
import type { Person } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState,measured } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { cx, str, avatarColor } from "@/lib/utils";
import { api } from "@/lib/api";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";

const SKILLS = ["全部", "前端", "后端", "Python", "Go", "报告撰写", "PPT 制作", "需求对接", "运维"];

type PersonRow=Omit<Person,"load"|"skills"|"projects"> & {load?:number;skills?:string[];projects?:string[];orgId:string};
type OrgNode = { id: string; name: string; type: string; children: OrgNode[] };
function normalize(items: Record<string,unknown>[]): PersonRow[] {
 return items.map((x):PersonRow=>({id:str(x.id),name:str(x.name),title:str(x.title,"—"),department:str(x.department,str(x.org_id,"—")),skills:Array.isArray(x.skills)?x.skills.filter((s):s is string=>typeof s==="string"):undefined,projects:Array.isArray(x.projects)?x.projects.filter((s):s is string=>typeof s==="string"):undefined,load:measured(x.load),status:str(x.status,"—"),color:avatarColor(str(x.name)),orgId:str(x.org_id)}));
}

function OrgNodes({ items, depth, counts }: { items: OrgNode[]; depth: number; counts: Record<string, number> }) {
  return (
    <>
      {items.map((o) => (
        <div key={o.id}>
          <div className="flex items-center gap-2 py-1.5 text-[12.5px]" style={{ paddingLeft: depth * 16 }}>
            <Building2 size={13} className="shrink-0 text-ink-3" />
            <span className="flex-1 truncate text-ink-2">{o.name}</span>
            <span className="text-[11.5px] text-ink-3">{counts[o.id] ?? 0}</span>
          </div>
          {o.children?.length ? <OrgNodes items={o.children} depth={depth + 1} counts={counts} /> : null}
        </div>
      ))}
    </>
  );
}

const loadColor = (v: number) => (v >= 90 ? "var(--color-red)" : v >= 75 ? "var(--color-orange)" : v >= 40 ? "var(--color-green)" : "var(--color-green)");

export default function TeamPage() {
  const query=useData<unknown[]>("people", "/people"),state=recordQueryState(query);
  const orgQuery=useData<unknown[]>("org-tree", "/orgs/tree");
  const [skill, setSkill] = useState("全部");
  const [q, setQ] = useState("");
  const [inviting, setInviting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState("member");
  const [invite, setInvite] = useState<{ token: string } | null>(null);
  if(state.kind==="pending"||state.kind==="error")return <><PageHeader title="团队" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无人员" /></>;
  const people=normalize(state.kind==="ready"?state.items:[]);
  const orgs=(orgQuery.data ?? []) as unknown as OrgNode[];
  const counts=people.reduce<Record<string, number>>((acc, p) => { if (p.orgId) acc[p.orgId] = (acc[p.orgId] ?? 0) + 1; return acc; }, {});
  const kw = q.trim().toLowerCase();
  const shown = people.filter((p) =>
    (skill === "全部" || p.skills?.some((s) => s.includes(skill))) &&
    (!kw || `${p.name}${p.title}${p.department}`.toLowerCase().includes(kw)));

  const inviteMember = async () => {
    setSaving(true);
    try {
      const res = await api<{ token: string }>("/invitations", { method: "POST", body: JSON.stringify({ role }) });
      setInvite({ token: res.token });
      toast("邀请已生成，把邀请码发给对方");
    } catch (e) { toast(errorText(e), "err"); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader
        title="团队"
        sub={`已加载 ${people.length} 人`}
        right={
          <>
            <SearchBox placeholder="搜索姓名 / 技能" className="w-56" value={q} onChange={setQ} />
            <button onClick={() => setInviting(true)} className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas">
              <UserPlus size={14} /> 邀请成员
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-3 p-6 pt-4">
        {/* 组织架构 */}
        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">组织架构</h3>
            <span className="text-[11.5px] text-ink-3">按组织统计成员数</span>
          </div>
          {orgs.length ? <OrgNodes items={orgs} depth={0} counts={counts} /> : <p className="py-3 text-[12px] text-ink-3">{orgQuery.isPending ? "加载中…" : "暂无可查看的组织"}</p>}
        </Card>

        {/* 成员表 */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[12.5px] text-ink-3">技能标签：</span>
            {SKILLS.map((s) => (
              <button
                key={s}
                onClick={() => setSkill(s)}
                className={cx(
                  "h-7 rounded-full px-3 text-[12.5px]",
                  skill === s ? "bg-ink font-medium text-canvas" : "border border-border bg-panel text-ink-2 hover:bg-fill",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                  <th className="px-5 py-2.5 font-medium">姓名 / 职称</th>
                  <th className="px-3 py-2.5 font-medium">所在项目</th>
                  <th className="px-3 py-2.5 font-medium">技能标签</th>
                  <th className="w-[15%] px-3 py-2.5 font-medium">本周负载</th>
                  <th className="px-5 py-2.5 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-canvas">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={p.name} color={p.color} size={30} />
                        <span>
                          <span className="block text-[13px] font-medium">{p.name}</span>
                          <span className="block text-[11.5px] text-ink-3">{p.title}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.projects ? p.projects.map((x) => (
                          <span key={x} className="rounded-[5px] bg-fill px-1.5 py-0.5 text-[11.5px] text-ink-2">{x}</span>
                        )) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.skills ? p.skills.map((s) => <Badge key={s} color="var(--color-ink)">{s}</Badge>) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        {p.load!==undefined ? <><Bar value={p.load} color={loadColor(p.load)} height={5} /><span className="w-9 shrink-0 text-right text-[11.5px] text-ink-3 tabular-nums">{p.load}%</span></> : <span className="text-ink-3">暂不可用</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3"><Badge color={STATUS_COLOR[p.status] || "var(--color-ink-3)"}>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length===0 && <Empty text="没有符合条件的人员" />}
          </Card>
        </div>
      </div>

      <Modal
        open={inviting}
        title="邀请成员"
        onClose={() => { setInviting(false); setInvite(null); }}
        footer={<>
          <button onClick={() => { setInviting(false); setInvite(null); }} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">关闭</button>
          <button onClick={() => void inviteMember()} disabled={saving || !!invite} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-60">{saving ? "生成中…" : "生成邀请码"}</button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <Field label="成员角色">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">成员</option>
              <option value="project_lead">项目负责人</option>
            </select>
          </Field>
          {invite && (
            <div className="rounded-[6px] bg-fill px-3 py-2.5">
              <p className="text-[11.5px] text-ink-3">邀请码（7 天内有效，交给对方注册使用）</p>
              <p className="mt-1 break-all font-mono text-[12px] text-ink">{invite.token}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
