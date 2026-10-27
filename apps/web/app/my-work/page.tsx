"use client";

import React, { useMemo, useState } from "react";
import { CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { Shell } from "@/components/shell";
import { Card, Badge, PageHeader, Empty } from "@/components/ui";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState, measured } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";
import { todayISO } from "@/lib/home";
import { cx, str } from "@/lib/utils";

type Task = {
  id: string; name: string; status: string; start: string; end: string;
  hours?: number; progress?: number; ownerId: string; members: string[]; projectId: string;
};

const STATUS_TEXT: Record<string, string> = {
  draft: "草稿", pending_coordination: "待协调", in_progress: "进行中",
  pending_acceptance: "待验收", done: "已完成", archived: "已归档", cancelled: "已取消",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "var(--color-ink-3)", pending_coordination: "var(--color-orange)", in_progress: "var(--color-blue)",
  pending_acceptance: "var(--color-purple)", done: "var(--color-green)", archived: "var(--color-ink-3)", cancelled: "var(--color-ink-3)",
};

function normalize(items: Record<string, unknown>[]): Task[] {
  return items.map((x) => ({
    id: str(x.id),
    name: str(x.name, "未命名任务"),
    status: str(x.status, "draft"),
    start: str(x.start_date, ""),
    end: str(x.end_date, ""),
    hours: measured(x.daily_hours),
    progress: measured(x.progress),
    ownerId: str(x.owner_id),
    members: Array.isArray(x.member_ids) ? x.member_ids.map(String) : [],
    projectId: str(x.project_id),
  }));
}

export default function MyWorkPage() {
  const user = useAuth((s) => s.user);
  const query = useData<unknown[]>("tasks", "/tasks");
  const state = recordQueryState(query, "name");
  const [reportFor, setReportFor] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ progress: "50", hours: "4", note: "" });

  const today = todayISO(new Date());
  const tasks = useMemo(() => (state.kind === "ready" ? normalize(state.items) : []), [state]);

  const mine = tasks.filter((t) => t.ownerId === user?.id || t.members.includes(user?.id ?? ""));
  const open = mine.filter((t) => !["done", "archived", "cancelled"].includes(t.status));
  const groups = [
    { key: "today", label: "今天截止", rows: open.filter((t) => t.end === today) },
    { key: "overdue", label: "已逾期", rows: open.filter((t) => t.end && t.end < today) },
    { key: "week", label: "接下来", rows: open.filter((t) => t.end > today || !t.end) },
    { key: "closed", label: "已完成", rows: mine.filter((t) => t.status === "done") },
  ].filter((g) => g.rows.length > 0);

  if (state.kind === "pending" || state.kind === "error") {
    return <Shell><PageHeader title="我的工作" /><QueryNotice state={state} retry={() => query.refetch()} emptyText="暂无任务" /></Shell>;
  }

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setSaving(true);
    try {
      await fn();
      toast(message);
      setReportFor(null);
      await query.refetch();
    } catch (e) { toast(errorText(e), "err"); } finally { setSaving(false); }
  };

  const report = () => {
    if (!reportFor) return;
    const progress = Number(form.progress), hours = Number(form.hours);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) return toast("进度需在 0-100 之间", "err");
    void act(
      () => api(`/tasks/${reportFor.id}/action`, { method: "POST", body: JSON.stringify({ action: "report", progress, hours, note: form.note }) }),
      "进度已上报",
    );
  };

  return (
    <Shell>
      <PageHeader
        title="我的工作"
        sub={`${user?.name ?? ""} · 进行中 ${open.length} 项`}
        right={<button onClick={() => void query.refetch()} className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12.5px] text-ink-2 hover:bg-fill"><RefreshCw size={13} /> 刷新</button>}
      />

      <div className="flex flex-col gap-3 p-6 pt-4">
        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">我的任务</h3>
            <span className="text-[11.5px] text-ink-3">按截止时间排列</span>
          </div>
          {groups.length === 0 ? <Empty text="暂无分配给你的任务" /> : groups.map((g) => (
            <div key={g.key}>
              <p className="pt-3 pb-1 text-[11.5px] text-ink-3">{g.label} · {g.rows.length}</p>
              {g.rows.map((t) => {
                const mineOwner = t.ownerId === user?.id;
                return (
                  <div key={t.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                    <span className="shrink-0 text-ink-3">
                      {t.status === "done" ? <CheckCircle2 size={16} className="text-green" /> : <Circle size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cx("truncate text-[12.5px] font-medium", t.status === "done" ? "text-ink-3 line-through" : "text-ink")}>{t.name}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        {t.start && t.end ? `${t.start} → ${t.end}` : "未排期"}
                        {t.hours ? ` · 每日 ${t.hours}h` : ""}
                        {t.progress !== undefined ? ` · 进度 ${t.progress}%` : ""}
                      </p>
                    </div>
                    <Badge color={STATUS_COLOR[t.status] ?? "var(--color-ink-3)"}>{STATUS_TEXT[t.status] ?? t.status}</Badge>
                    {t.status === "pending_confirmation" && (mineOwner || t.members.includes(user?.id ?? "")) && (
                      <button
                        onClick={() => void act(() => api(`/tasks/${t.id}/action`, { method: "POST", body: JSON.stringify({ action: "confirm" }) }), "任务已确认")}
                        disabled={saving}
                        className="h-7 rounded-sm bg-ink px-2.5 text-[11.5px] font-medium text-canvas disabled:opacity-60"
                      >
                        确认任务
                      </button>
                    )}
                    {t.status === "in_progress" && (
                      <button
                        onClick={() => { setReportFor(t); setForm({ progress: String(t.progress ?? 50), hours: "4", note: "" }); }}
                        className="h-7 rounded-sm border border-border px-2.5 text-[11.5px] text-ink-2 hover:bg-fill"
                      >
                        上报进度
                      </button>
                    )}
                    {t.status === "in_progress" && mineOwner && (
                      <button
                        onClick={() => void act(() => api(`/tasks/${t.id}/action`, { method: "POST", body: JSON.stringify({ action: "submit_acceptance" }) }), "已提交验收")}
                        disabled={saving}
                        className="h-7 rounded-sm border border-border px-2.5 text-[11.5px] text-ink-2 hover:bg-fill disabled:opacity-60"
                      >
                        提交验收
                      </button>
                    )}
                    {t.status === "pending_acceptance" && (
                      <>
                        <button
                          onClick={() => void act(() => api(`/tasks/${t.id}/action`, { method: "POST", body: JSON.stringify({ action: "accept" }) }), "验收通过")}
                          disabled={saving}
                          className="h-7 rounded-sm bg-green px-2.5 text-[11.5px] font-medium text-canvas disabled:opacity-60"
                        >
                          验收通过
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt("退回原因")?.trim();
                            if (reason) void act(() => api(`/tasks/${t.id}/action`, { method: "POST", body: JSON.stringify({ action: "return", reason }) }), "已退回");
                          }}
                          disabled={saving}
                          className="h-7 rounded-sm border border-border px-2.5 text-[11.5px] text-red disabled:opacity-60"
                        >
                          退回
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      </div>

      <Modal
        open={!!reportFor}
        title={`上报进度 · ${reportFor?.name ?? ""}`}
        onClose={() => setReportFor(null)}
        footer={<>
          <button onClick={() => setReportFor(null)} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void report()} disabled={saving} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-60">{saving ? "提交中…" : "提交"}</button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="完成进度（%）">
              <input type="number" min={0} max={100} className={inputCls} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />
            </Field>
            <Field label="本次工时（小时）">
              <input type="number" min={0} max={24} step="0.5" className={inputCls} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </Field>
          </div>
          <Field label="进展说明">
            <textarea
              className="min-h-20 w-full resize-none rounded-[6px] border border-border px-2.5 py-2 text-[12.5px] outline-none focus:border-ink-4"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="例如：完成接口联调，剩余用例待补"
            />
          </Field>
        </div>
      </Modal>
    </Shell>
  );
}
