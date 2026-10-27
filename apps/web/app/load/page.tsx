"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Shell } from "@/components/shell";
import { Card, Badge, Avatar, PageHeader, Empty } from "@/components/ui";
import { QueryNotice } from "@/components/query-notice";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";
import { dayLabel } from "@/lib/home";
import { avatarColor, cx, num, str } from "@/lib/utils";

type Daily = { date: string; hours: number; capacity: number; ratio: number };
type HomeLoad = {
  team_load_7d?: { dates?: string[]; people?: { person_id: string; name: string; daily: Daily[] }[] };
};
type Conflict = {
  id?: string; type: string; severity: string; task_id?: string; person_id?: string;
  status?: string; forced_until?: string; force_reason?: string; days?: string[];
};
type TaskLite = { id?: string; name?: string; title?: string };

const CONFLICT_LABEL: Record<string, string> = {
  workload_overload: "任务负载过载",
  all_day_overlap: "全天任务冲突",
  person_unavailable: "成员不可用",
  invalid_date_range: "任务日期异常",
};

const heat = (d?: Daily) => {
  if (!d) return "var(--color-fill)";
  if (d.capacity === 0) return "var(--color-fill-2)";
  if (d.ratio >= 100) return "var(--color-red-soft)";
  if (d.ratio >= 80) return "var(--color-orange-soft)";
  if (d.ratio >= 50) return "var(--color-green-soft)";
  return "var(--color-fill)";
};

export default function LoadPage() {
  const user = useAuth((s) => s.user);
  const homeQ = useQuery({ queryKey: ["load-home"], queryFn: () => api<HomeLoad>("/home"), staleTime: 30_000, retry: 1 });
  const conflictQ = useQuery({ queryKey: ["load-conflicts"], queryFn: () => api<unknown>("/load/conflicts"), staleTime: 30_000, retry: 1 });
  const taskQ = useQuery({ queryKey: ["load-tasks"], queryFn: () => api<unknown>("/tasks"), staleTime: 60_000, retry: 1 });

  const [target, setTarget] = useState<Conflict | null>(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);

  const dates = homeQ.data?.team_load_7d?.dates ?? [];
  const people = homeQ.data?.team_load_7d?.people ?? [];
  const conflicts = (Array.isArray((conflictQ.data as { items?: Conflict[] })?.items) ? (conflictQ.data as { items: Conflict[] }).items : []) as Conflict[];
  const tasks = (Array.isArray((taskQ.data as { items?: TaskLite[] })?.items) ? (taskQ.data as { items: TaskLite[] }).items : []) as TaskLite[];
  const taskName = (id?: string) => {
    const t = tasks.find((x) => str(x.id) === str(id));
    return str(t?.name, str(t?.title, "任务"));
  };
  const personName = (id?: string) => people.find((p) => p.person_id === id)?.name ?? "—";
  const canForce = ["center_director", "super_admin"].includes(str(user?.role));

  const pending = homeQ.isPending || conflictQ.isPending;
  const failed = homeQ.isError || conflictQ.isError;

  const force = async () => {
    if (!target?.id) return;
    if (!reason.trim()) return toast("请填写强制协调原因", "err");
    setSaving(true);
    try {
      await api(`/conflicts/${target.id}/force`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), forced_until: until || undefined }) });
      toast("已限期强制协调");
      setTarget(null);
      setReason("");
      setUntil("");
      await conflictQ.refetch();
    } catch (e) { toast(errorText(e), "err"); } finally { setSaving(false); }
  };

  return (
    <Shell>
      <PageHeader
        title="负载与冲突"
        sub={`${people.length} 人 · 未来 7 天 · 冲突 ${conflicts.length} 项`}
        right={<Badge color={conflicts.length ? "var(--color-red)" : "var(--color-green)"}>{conflicts.length ? `${conflicts.length} 项待协调` : "无冲突"}</Badge>}
      />

      <div className="flex flex-col gap-3 p-6 pt-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">部门负载热力图</h3>
            <div className="flex items-center gap-2.5 text-[11.5px] text-ink-3">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: "var(--color-fill)" }} />空闲</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: "var(--color-green-soft)" }} />正常</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: "var(--color-orange-soft)" }} />饱和</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: "var(--color-red-soft)" }} />过载</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: "var(--color-fill-2)" }} />不可用</span>
            </div>
          </div>
          {pending ? <p className="py-6 text-center text-[12.5px] text-ink-3">加载中…</p>
            : failed ? (
              <div className="flex flex-col items-center gap-2 py-6 text-[12.5px] text-ink-3">
                <span className="flex items-center gap-1.5 text-red"><AlertTriangle size={13} />负载数据加载失败</span>
                <button onClick={() => { void homeQ.refetch(); void conflictQ.refetch(); }} className="h-7 rounded-sm border border-border px-2.5 text-[12px] text-ink-2">重试</button>
              </div>
            ) : people.length === 0 ? <Empty text="暂无可查看的成员" /> : (
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="mb-1 flex">
                    <span className="w-[104px] shrink-0" />
                    <div className="grid flex-1 gap-[4px]" style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}>
                      {dates.map((d) => <span key={d} className="rounded-[4px] py-0.5 text-center text-[11px] text-ink-3">{dayLabel(d)}</span>)}
                    </div>
                  </div>
                  {people.map((p) => (
                    <div key={p.person_id} className="mb-[4px] flex items-center">
                      <span className="flex w-[104px] shrink-0 items-center gap-1.5">
                        <Avatar name={p.name} color={avatarColor(p.name)} size={18} />
                        <span className="truncate text-[11.5px] text-ink-2">{p.name}</span>
                      </span>
                      <div className="grid flex-1 gap-[4px]" style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}>
                        {dates.map((d) => {
                          const c = p.daily?.find((x) => x.date === d);
                          return (
                            <span
                              key={d}
                              title={`${p.name} ${d} ${num(c?.hours)}h / ${num(c?.capacity)}h · ${num(c?.ratio)}%`}
                              className={cx("flex h-7 items-center justify-center rounded-[4px] text-[11px]",
                                (c?.ratio ?? 0) >= 100 && "font-medium text-red")}
                              style={{ background: heat(c) }}
                            >
                              {c?.capacity === 0 ? "休" : (c?.ratio ?? 0) >= 100 ? "!" : ""}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">待协调冲突</h3>
            <span className="text-[11.5px] text-ink-3">按影响排序</span>
          </div>
          {conflicts.length === 0 ? <Empty text="当前没有需要协调的冲突" /> : (
            <div className="flex flex-col gap-2.5">
              {conflicts.map((c, i) => (
                <div key={`${c.id ?? i}`} className={cx("rounded-md border p-3", c.severity === "blocking" ? "border-red/30" : "border-border")}>
                  <div className="flex items-center gap-2">
                    <Avatar name={personName(c.person_id)} color={avatarColor(personName(c.person_id))} size={24} />
                    <span className="text-[13px] font-semibold">{personName(c.person_id)}</span>
                    {c.severity === "blocking" && <Badge color="var(--color-red)">阻塞</Badge>}
                    {c.status === "forced" && <Badge color="var(--color-orange)">已限期强制</Badge>}
                    <span className="ml-auto text-[11.5px] text-ink-3">{CONFLICT_LABEL[c.type] ?? c.type}</span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-2">
                    <span className={cx("h-3 w-[2.5px] rounded-full", c.severity === "blocking" ? "bg-red" : "bg-orange")} />
                    {taskName(c.task_id)}
                    {c.days?.length ? ` · ${c.days.join("、")}` : ""}
                  </p>
                  {c.status === "forced" && (
                    <p className="mt-1.5 text-[11.5px] text-ink-3">{c.force_reason} · 至 {str(c.forced_until, "").slice(0, 10)}</p>
                  )}
                  {canForce && c.id && c.status !== "forced" && (
                    <div className="mt-2.5 flex gap-2">
                      <button onClick={() => setTarget(c)} className="h-7 rounded-sm bg-ink px-2.5 text-[11.5px] font-medium text-canvas">限期强制协调</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!canForce && <p className="mt-2 text-[11.5px] text-ink-3">强制协调需要中心主任或超级管理员权限。</p>}
        </Card>
      </div>

      <Modal
        open={!!target}
        title="限期强制协调"
        onClose={() => setTarget(null)}
        footer={<>
          <button onClick={() => setTarget(null)} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void force()} disabled={saving} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-60">{saving ? "提交中…" : "确认"}</button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-6 text-ink-2">
            {personName(target?.person_id)} · {taskName(target?.task_id)} · {CONFLICT_LABEL[target?.type ?? ""] ?? target?.type}
          </p>
          <Field label="强制原因">
            <textarea
              className="min-h-20 w-full resize-none rounded-[6px] border border-border px-2.5 py-2 text-[12.5px] outline-none focus:border-ink-4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="说明为什么必须带着冲突推进"
            />
          </Field>
          <Field label="有效至（可选，默认 7 天）">
            <input type="date" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Shell>
  );
}
