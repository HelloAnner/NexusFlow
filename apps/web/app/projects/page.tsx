"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Shell } from "@/components/shell";
import {
  Card, Badge, Avatar, Bar, Marker, PageHeader,
  SearchBox, Empty, TYPE_COLOR,
} from "@/components/ui";
import type { Project } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState,measured } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { cx, str, md, avatarColor } from "@/lib/utils";
import { projectStatusColor, projectStatusText } from "@/lib/home";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";

const TYPES = ["科研", "市场", "出差", "文职", "党建", "学习", "休假"];
const LEVELS = ["公司级", "处级", "中心级"];

type ProjectRow = Omit<Project,"progress"> & {progress?:number;members?:string[]};
function normalize(items: Record<string,unknown>[]): ProjectRow[] {
 return items.map((x):ProjectRow=>({id:str(x.id),name:str(x.name),type:str(x.type,"—"),level:str(x.level),owner:str(x.owner,str(x.owner_id,"—")),ownerColor:avatarColor(str(x.owner_id)),start:str(x.start_date),end:str(x.end_date),progress:measured(x.progress),status:str(x.status,"—"),updated:str(x.updated_at,"—"),marker:"circle",color:"#86868f",members:Array.isArray(x.member_ids)?x.member_ids.filter((id):id is string=>typeof id==="string"):undefined}));
}

function progressColor(p: ProjectRow): string {
  if (p.status === "完成" || (p.progress !== undefined && p.progress >= 100)) return "#a8a8b0";
  if (p.status === "逾期") return "#12855a";
  if (p.type === "市场") return "#6d5bd0";
  if (p.type === "文职") return "#2563eb";
  return "#12855a";
}

export default function ProjectsPage() {
  const router = useRouter();
  const query = useData<unknown[]>("projects", "/projects"),state=recordQueryState(query);
  const user = useAuth((s) => s.user);
  const [type, setType] = useState("全部");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", type: "科研", level: "中心级", start_date: "", end_date: "" });
  if(state.kind!=="ready")return <Shell><PageHeader title="项目" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无项目" /></Shell>;
  const projects=normalize(state.items);
  const kw = q.trim().toLowerCase();
  const shown = projects.filter((p) =>
    (type === "全部" || p.type === type) && (!level || p.level === level) &&
    (!kw || `${p.name}${p.owner}`.toLowerCase().includes(kw)));

  const create = async () => {
    if (!form.name.trim()) return toast("请填写项目名称", "err");
    setSaving(true);
    try {
      await api("/projects", { method: "POST", body: JSON.stringify({
        name: form.name.trim(), type: form.type, level: form.level, status: "planning", org_id: user?.orgId,
        owner: user?.name || "", owner_id: user?.id, start_date: form.start_date, end_date: form.end_date, progress: 0,
      }) });
      toast("项目已创建");
      setCreating(false);
      setForm({ name: "", type: "科研", level: "中心级", start_date: "", end_date: "" });
      await query.refetch();
    } catch (e) { toast(errorText(e), "err"); } finally { setSaving(false); }
  };

  return (
    <Shell>
      <PageHeader
        title="项目"
        sub={`共 ${shown.length} 个项目`}
        right={
          <>
            <SearchBox placeholder="搜索项目名称 / 负责人" className="w-64" value={q} onChange={setQ} />
            <button onClick={() => setCreating(true)} className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
              <Plus size={14} /> 新建项目
            </button>
          </>
        }
      />
      {/* 筛选条 */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-2.5">
        {["全部", ...TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cx(
              "h-7 rounded-full px-3 text-[12.5px]",
              type === t ? "bg-ink font-medium text-white" : "border border-border bg-panel text-ink-2 hover:bg-fill",
            )}
          >
            {t}
          </button>
        ))}
        <span className="ml-3 text-[12.5px] text-ink-3">级别：</span>
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(level === l ? "" : l)}
            className={cx(
              "h-7 rounded-full px-3 text-[12.5px]",
              level === l ? "bg-ink font-medium text-white" : "border border-border bg-panel text-ink-2 hover:bg-fill",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="p-6 pt-4">
        <Card className="overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">项目名称</th>
                <th className="px-3 py-2.5 font-medium">类型</th>
                <th className="px-3 py-2.5 font-medium">负责人</th>
                <th className="px-3 py-2.5 font-medium">起止时间</th>
                <th className="w-[16%] px-3 py-2.5 font-medium">进度</th>
                <th className="px-3 py-2.5 font-medium">成员</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-5 py-2.5 text-right font-medium">更新</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/projects/plan?id=${p.id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-canvas"
                >
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2.5 font-medium text-ink">
                      <Marker color={p.color} shape={p.marker} />
                      {p.name}
                    </span>
                  </td>
                  <td className="px-3 py-3"><Badge color={TYPE_COLOR[p.type] || "#86868f"}>{p.type}</Badge></td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      <Avatar name={p.owner} color={p.ownerColor} size={22} />
                      <span className="text-ink-2">{p.owner}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-ink-3 tabular-nums">{md(p.start)} - {md(p.end)}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      {p.progress !== undefined ? <><Bar value={p.progress} color={progressColor(p)} height={4} /><span className="w-8 shrink-0 text-right text-[11.5px] text-ink-3 tabular-nums">{p.progress}%</span></> : <span className="text-ink-3">—</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex -space-x-1.5">
                      {p.members ? p.members.map((c, i) => (
                        <span
                          key={i}
                          className="flex h-5 w-5 items-center justify-center rounded-[5px] border border-panel text-[9px] font-semibold"
                          style={{ background: `${avatarColor(c)}1A`, color: avatarColor(c) }}
                        >
                          {c.slice(0,1)}
                        </span>
                      )) : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3"><Badge color={projectStatusColor(p.status)}>{projectStatusText(p.status)}</Badge></td>
                  <td className="px-5 py-3 text-right text-[11.5px] text-ink-3">{p.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <Empty text="没有符合条件的项目" />}
        </Card>
      </div>

      <Modal
        open={creating}
        title="新建项目"
        onClose={() => setCreating(false)}
        footer={<>
          <button onClick={() => setCreating(false)} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void create()} disabled={saving} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white disabled:opacity-60">{saving ? "创建中…" : "创建"}</button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <Field label="项目名称">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：智慧油田数据平台" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="级别">
              <select className={inputCls} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始时间">
              <input type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="截止时间">
              <input type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
