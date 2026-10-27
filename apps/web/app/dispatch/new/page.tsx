"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, X, AlertTriangle, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/shell";
import { Card, Badge, Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast, errorText } from "@/components/feedback";
import { avatarColor, cx, num, str } from "@/lib/utils";

const TYPES = ["科研", "市场", "出差", "文职", "党建", "学习", "休假"];

type PersonRec = { id?: string; name?: string; title?: string; department?: string; user_id?: string; status?: string };
type LoadRow = { person_id?: string; ratio?: number; hours?: number; capacity?: number };
type ProjectRec = { id?: string; name?: string };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-[11.5px] text-ink-3">{label}</p>
      {children}
    </div>
  );
}

const inputCls = "h-9 w-full rounded-sm border border-border bg-panel px-3 text-[12.5px] outline-none placeholder:text-ink-3 focus:border-ink-4";

export default function DispatchNewPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const today = new Date().toISOString().slice(0, 10);
  const peopleQ = useQuery({ queryKey: ["dispatch-people"], queryFn: () => api<unknown>("/people"), staleTime: 60_000, retry: 1 });
  const projectsQ = useQuery({ queryKey: ["dispatch-projects"], queryFn: () => api<unknown>("/projects"), staleTime: 60_000, retry: 1 });
  const loadQ = useQuery({ queryKey: ["dispatch-load", today], queryFn: () => api<unknown>(`/load?date=${today}`), staleTime: 30_000, retry: 1 });

  const people = (Array.isArray((peopleQ.data as { items?: PersonRec[] })?.items) ? (peopleQ.data as { items: PersonRec[] }).items : []) as PersonRec[];
  const projects = (Array.isArray((projectsQ.data as { items?: ProjectRec[] })?.items) ? (projectsQ.data as { items: ProjectRec[] }).items : []) as ProjectRec[];
  const loads = (Array.isArray((loadQ.data as { items?: LoadRow[] })?.items) ? (loadQ.data as { items: LoadRow[] }).items : []) as LoadRow[];
  const loadOf = (person: PersonRec) => loads.find((l) => l.person_id === (person.user_id || person.id));

  const [form, setForm] = useState({ name: "", type: "科研", projectId: "", description: "", ownerId: "", start: today, end: today, hours: "4" });
  const [members, setMembers] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState<"standard" | "supplemental">("standard");
  const [pick, setPick] = useState("");
  const [submitting, setSubmitting] = useState<"" | "draft" | "submit">("");

  const assignable = people.filter((p) => p.status !== "disabled");
  const owner = assignable.find((p) => (p.user_id || p.id) === form.ownerId);
  const memberRows = members.map((id) => assignable.find((p) => (p.user_id || p.id) === id)).filter(Boolean) as PersonRec[];
  const over = [...(owner ? [owner] : []), ...memberRows].filter((p) => (loadOf(p)?.ratio ?? 0) >= 100);

  const create = async (publish: boolean) => {
    if (!form.name.trim()) return toast("请填写任务名称", "err");
    if (!form.ownerId) return toast("请选择负责人", "err");
    if (!form.start || !form.end || form.start > form.end) return toast("请选择有效的起止时间", "err");
    const hours = Number(form.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) return toast("每日投入需在 0-24 小时之间", "err");
    setSubmitting(publish ? "submit" : "draft");
    try {
      const task = await api<{ id: string }>("/tasks", { method: "POST", body: JSON.stringify({
        name: form.name.trim(), type: form.type, description: form.description,
        project_id: form.projectId || undefined, owner_id: form.ownerId, owner: owner?.name ?? "",
        member_ids: members, start_date: form.start, end_date: form.end, daily_hours: hours, status: "draft",
      }) });
      const assignees = [...new Set([form.ownerId, ...members])];
      for (const userId of assignees) {
        await api(`/tasks/${task.id}/assignments`, { method: "POST", body: JSON.stringify({
          user_id: userId, start_date: form.start, end_date: form.end, daily_hours: hours, all_day: false,
        }) });
      }
      const dispatch = await api<{ id: string }>("/dispatch", { method: "POST", body: JSON.stringify({
        task_id: task.id, requester_id: user?.id, workflow, target_org_ids: [], status: "draft",
      }) });
      if (!publish) {
        toast("已存为草稿");
        router.push("/my-work");
        return;
      }
      await api(`/dispatch/${dispatch.id}/submit`, { method: "POST", body: JSON.stringify({}) });
      toast(workflow === "supplemental" ? "已提交，等待发起人确认后补内容" : "已提交审批");
      router.push("/inbox");
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSubmitting("");
    }
  };

  return (
    <Shell>
      <div className="flex items-center gap-2.5 border-b border-border px-6 py-3.5">
        <button onClick={() => router.back()} aria-label="返回" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-fill">
          <ArrowLeft size={16} className="text-ink-2" />
        </button>
        <h1 className="text-[16px] font-semibold">派发任务</h1>
        <Badge color="#16161a">{workflow === "standard" ? "标准流程" : "后补流程"}</Badge>
        <span className="text-[12.5px] text-ink-3">发起人 {user?.name ?? "—"}</span>
      </div>

      <div className="flex flex-col gap-3 p-6 pt-4">
        <Card className="p-5">
          <Field label="任务类型">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={cx(
                    "h-7 rounded-full px-3 text-[12.5px]",
                    form.type === t ? "bg-ink font-medium text-white" : "border border-border text-ink-2 hover:bg-fill",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="任务名称">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：数据中台迁移演练" />
            </Field>
            <Field label="所属项目（可选）">
              <select className={inputCls} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">不挂项目</option>
                {projects.map((p) => <option key={str(p.id)} value={str(p.id)}>{str(p.name, "未命名项目")}</option>)}
              </select>
            </Field>
          </div>

          <Field label="任务概述" className="mt-4">
            <textarea
              className="min-h-16 w-full resize-none rounded-sm border border-border p-3 text-[12.5px] outline-none focus:border-ink-4"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="写清楚交付物与验收标准"
            />
          </Field>

          <div className="mt-4 grid grid-cols-4 gap-3">
            <Field label="负责人">
              <select className={inputCls} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">选择负责人</option>
                {assignable.map((p) => <option key={str(p.user_id || p.id)} value={str(p.user_id || p.id)}>{str(p.name, "—")}</option>)}
              </select>
            </Field>
            <Field label="开始时间">
              <div className="relative">
                <input type="date" className={inputCls} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                <Calendar size={14} className="pointer-events-none absolute top-2.5 right-3 text-ink-3" />
              </div>
            </Field>
            <Field label="截止时间">
              <div className="relative">
                <input type="date" className={inputCls} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                <Calendar size={14} className="pointer-events-none absolute top-2.5 right-3 text-ink-3" />
              </div>
            </Field>
            <Field label="每日投入（小时）">
              <input type="number" min={0} max={24} step="0.5" className={inputCls} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </Field>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11.5px] text-ink-3">参与成员</p>
              <span className="text-[11.5px] text-ink-3">成员与负责人都会收到待确认任务</span>
            </div>
            <div className="flex flex-col gap-2">
              {memberRows.map((m) => {
                const load = loadOf(m);
                const until = (load?.ratio ?? 0) >= 100;
                return (
                  <div key={str(m.user_id || m.id)} className={cx("flex items-center gap-3 rounded-md border px-3 py-2.5", until ? "border-orange/50 bg-[#FFFBF4]" : "border-border")}>
                    <Avatar name={str(m.name, "?")} color={avatarColor(str(m.name))} size={26} />
                    <span className="text-[12.5px] font-medium">{str(m.name)}</span>
                    <span className="text-[11.5px] text-ink-3">{str(m.title, "")} {str(m.department, "")}</span>
                    <span className="ml-auto flex items-center gap-2 text-[11.5px]">
                      <span className={until ? "font-medium text-red" : "text-ink-2"}>今日 {num(load?.ratio)}%</span>
                      <button onClick={() => setMembers(members.filter((id) => id !== (m.user_id || m.id)))} aria-label="移除成员" className="text-ink-3 hover:text-ink">
                        <X size={13} />
                      </button>
                    </span>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">添加成员…</option>
                  {assignable
                    .filter((p) => !members.includes(str(p.user_id || p.id)) && str(p.user_id || p.id) !== form.ownerId)
                    .map((p) => <option key={str(p.user_id || p.id)} value={str(p.user_id || p.id)}>{str(p.name, "—")} · {str(p.department, "")}</option>)}
                </select>
                <button
                  onClick={() => { if (pick) { setMembers([...members, pick]); setPick(""); } }}
                  disabled={!pick}
                  className="h-9 shrink-0 rounded-sm border border-border px-3 text-[12.5px] text-ink-2 hover:bg-fill disabled:opacity-40"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          <Field label="派发方式" className="mt-4">
            <div className="flex flex-col gap-2">
              {([
                ["standard", "标准流程", "先审批后执行，按成员所在部门逐级签批"],
                ["supplemental", "后补流程", "先执行后补审批，需要发起人再次确认内容"],
              ] as const).map(([value, title, desc]) => (
                <button
                  key={value}
                  onClick={() => setWorkflow(value)}
                  className={cx("flex items-start gap-2.5 rounded-md border p-3 text-left", workflow === value ? "border-accent bg-accent-soft/40" : "border-border")}
                >
                  <span className={cx("mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border", workflow === value ? "border-accent" : "border-ink-4")}>
                    {workflow === value && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                  <span>
                    <span className="block text-[12.5px] font-medium">{title}</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-orange" />
            <h3 className="text-[13.5px] font-semibold">今日负载检查</h3>
            <Badge color={over.length ? "#d92d20" : "#12855a"}>{over.length ? `${over.length} 人已满负荷` : "正常"}</Badge>
          </div>
          {over.length === 0 ? (
            <p className="text-[11.5px] text-ink-3">所选成员今日负载未超 100%。</p>
          ) : (
            <div className="flex flex-col gap-2">
              {over.map((p) => {
                const load = loadOf(p);
                return (
                  <div key={str(p.user_id || p.id)} className="flex items-center gap-2 text-[12.5px]">
                    <Avatar name={str(p.name)} color={avatarColor(str(p.name))} size={22} />
                    <span className="font-medium">{str(p.name)}</span>
                    <span className="ml-auto text-[11.5px] text-red">今日 {num(load?.hours)}h / {num(load?.capacity)}h</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[11.5px] leading-5 text-ink-3">阻塞级冲突会在提交时被服务端拒绝，需要先调整时间或每日投入。</p>
        </Card>
      </div>

      <div className="sticky bottom-0 flex items-center border-t border-border bg-panel px-6 py-3">
        <span className="text-[11.5px] text-ink-3">提交后负责人和成员会收到待确认任务，审批通过后进入执行。</span>
        <div className="ml-auto flex gap-2">
          <button className="h-8 rounded-sm border border-border px-3.5 text-[12.5px] text-ink-2" onClick={() => router.back()}>取消</button>
          <button onClick={() => void create(false)} disabled={!!submitting} className="h-8 rounded-sm border border-border px-3.5 text-[12.5px] text-ink-2 disabled:opacity-60">
            {submitting === "draft" ? "保存中…" : "存草稿"}
          </button>
          <button onClick={() => void create(true)} disabled={!!submitting} className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60">
            <Send size={13} /> {submitting === "submit" ? "派发中…" : "确认派发"}
          </button>
        </div>
      </div>
    </Shell>
  );
}
