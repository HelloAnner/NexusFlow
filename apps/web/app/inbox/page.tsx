"use client";

import React, { useMemo, useState } from "react";
import { Check, X, CheckCheck } from "lucide-react";
import { Card, Badge, Avatar, PageHeader, Empty } from "@/components/ui";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast, errorText } from "@/components/feedback";
import { cx, str, avatarColor } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  approval: "审批",
  task_assigned: "指派",
  task_accept: "验收",
  task_return: "退回",
  mention: "提及",
  conflict_forced: "冲突",
  dispatch_approved: "派发",
  dispatch_rejected: "派发",
  founder_confirmation: "待确认",
};

const TYPE_COLOR: Record<string, string> = {
  审批: "var(--color-red)", 指派: "var(--color-blue)", 提及: "var(--color-purple)", 冲突: "var(--color-orange)",
  验收: "var(--color-green)", 退回: "var(--color-red)", 派发: "var(--color-blue)", 待确认: "var(--color-orange)", 系统: "var(--color-ink-3)",
};

type Row = {
  id: string; type: string; kind: string; title: string; desc: string;
  actor: string; actorColor: string; time: string; unread: boolean; sourceId: string;
};

function normalize(items: Record<string, unknown>[]): Row[] {
  return items.map((x) => {
    const type = str(x.type, "system");
    return {
      id: str(x.id),
      type,
      kind: TYPE_LABEL[type] ?? "系统",
      title: str(x.title, "未命名消息"),
      desc: str(x.message, str(x.desc, "")),
      actor: str(x.created_by_name, str(x.created_by, "系统")),
      actorColor: avatarColor(str(x.created_by, type)),
      time: str(x.created_at, "—").replace("T", " ").slice(0, 16),
      unread: !x.read_at,
      sourceId: str(x.source_id, ""),
    };
  }).sort((a, b) => (a.unread === b.unread ? 0 : a.unread ? -1 : 1));
}

const FILTERS = ["全部", "审批", "指派", "提及", "系统"] as const;

export default function InboxPage() {
  const query=useData<unknown[]>("inbox", "/inbox"),state=recordQueryState(query,"title");
  const approvalsQ = useQuery({ queryKey: ["inbox-approvals"], queryFn: () => api<unknown>("/approvals"), staleTime: 15_000, retry: 1 });
  const [filter, setFilter] = useState<string>("全部");
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => (state.kind === "ready" ? normalize(state.items) : []), [state]);
  if(state.kind!=="ready")return <><PageHeader title="收件箱" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无消息" /></>;

  const shown = items.filter((m) => {
    if (filter === "全部") return true;
    if (filter === "系统") return ["系统", "派发", "待确认", "冲突"].includes(m.kind);
    return m.kind === filter;
  });
  const selected = shown.find((m) => m.id === selectedId) || shown[0];
  const unread = items.filter((m) => m.unread).length;
  const approvals = (Array.isArray((approvalsQ.data as { items?: { id?: string; status?: string }[] })?.items)
    ? (approvalsQ.data as { items: { id?: string; status?: string }[] }).items : []);
  const approvalStatus = (id: string) => approvals.find((a) => str(a.id) === id)?.status;

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      toast(message);
      setReason("");
      await Promise.all([query.refetch(), approvalsQ.refetch()]);
    } catch (e) { toast(errorText(e), "err"); } finally { setBusy(false); }
  };

  const select = (m: Row) => {
    setSelectedId(m.id);
    if (m.unread) void api(`/inbox/${m.id}/read`, { method: "POST", body: JSON.stringify({}) }).then(() => query.refetch()).catch(() => {});
  };

  const markAll = () => act(async () => {
    await Promise.all(items.filter((m) => m.unread).map((m) =>
      api(`/inbox/${m.id}/read`, { method: "POST", body: JSON.stringify({}) })));
  }, "已全部标为已读");

  const decide = (approved: boolean) => act(
    () => api(`/approvals/${selected.sourceId}/decision`, { method: "POST", body: JSON.stringify({ approved, reason }) }),
    approved ? "已通过" : "已驳回",
  );

  const complete = () => act(
    () => api(`/inbox/${selected.id}/complete`, { method: "POST", body: JSON.stringify({ reason: reason.trim() || "已处理" }) }),
    "已标记完成",
  );

  const confirmDispatch = () => act(
    () => api(`/dispatch/${selected.sourceId}/confirm`, { method: "POST", body: JSON.stringify({}) }),
    "已确认派发",
  );

  return (
    <>
      <PageHeader
        title="收件箱"
        sub={unread ? `${unread} 条未读 · 共 ${items.length} 条` : `共 ${items.length} 条，已全部读过`}
        right={
          <button onClick={() => void markAll()} disabled={busy || unread === 0}
            className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-40">
            <CheckCheck size={14} /> 全部标为已读
          </button>
        }
      />

      <div className="flex flex-col">
        {/* 列表 */}
        <div className="border-b border-border">
          <div className="flex gap-2 px-5 py-3">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cx(
                  "h-7 rounded-full px-3 text-[12.5px]",
                  filter === f ? "bg-ink font-medium text-canvas" : "border border-border bg-panel text-ink-2 hover:bg-fill",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex flex-col">
            {shown.map((m) => (
              <button
                key={m.id}
                onClick={() => select(m)}
                className={cx(
                  "flex items-start gap-3 border-b border-border/60 px-5 py-3.5 text-left",
                  selected?.id === m.id ? "bg-accent-soft/50" : "hover:bg-canvas",
                )}
              >
                <Avatar name={m.actor} color={m.actorColor} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge color={TYPE_COLOR[m.kind] ?? "var(--color-ink-3)"}>{m.kind}</Badge>
                    <span className={cx("truncate text-[12.5px] text-ink", m.unread && "font-semibold")}>{m.title}</span>
                    {m.unread && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-red" />}
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{m.actor} · {m.time}</p>
                </div>
              </button>
            ))}
            {shown.length===0 && <Empty text="没有符合条件的消息" />}
          </div>
        </div>

        {/* 详情 */}
        <div className="p-5">
          {!selected ? <Empty text="选择一条消息查看" /> : (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Badge color={TYPE_COLOR[selected.kind] ?? "var(--color-ink-3)"}>{selected.kind}</Badge>
                <h2 className="text-[15px] font-semibold">{selected.title}</h2>
                <span className="ml-auto text-[11.5px] text-ink-3">{selected.actor} · {selected.time}</span>
              </div>

              {selected.type === "approval" && approvalStatus(selected.sourceId) && approvalStatus(selected.sourceId) !== "pending" ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-[12.5px] leading-6 text-ink-2">
                    该审批已处理（{approvalStatus(selected.sourceId) === "approved" ? "通过" : approvalStatus(selected.sourceId) === "rejected" ? "驳回" : approvalStatus(selected.sourceId)}）。
                  </p>
                  <button onClick={() => void complete()} disabled={busy}
                    className="flex h-8 w-fit items-center gap-1.5 rounded-sm bg-ink px-3.5 text-[12.5px] font-medium text-canvas disabled:opacity-60">
                    标记完成
                  </button>
                </div>
              ) : selected.type === "approval" ? (
                <>
                  <p className="mt-3 text-[12.5px] leading-6 text-ink-2">
                    这是派发审批消息：通过后任务进入执行状态；驳回需要填写原因，任务会退回发起人修改。
                  </p>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-3 h-9 w-full rounded-sm border border-border px-3 text-[12.5px] outline-none placeholder:text-ink-3 focus:border-ink-4"
                    placeholder="审批意见（驳回时必填）"
                  />
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void decide(true)} disabled={busy}
                      className="flex h-8 items-center gap-1.5 rounded-sm bg-green px-3.5 text-[12.5px] font-medium text-canvas disabled:opacity-60">
                      <Check size={14} /> 通过
                    </button>
                    <button onClick={() => void decide(false)} disabled={busy}
                      className="flex h-8 items-center gap-1.5 rounded-sm border border-red/50 px-3.5 text-[12.5px] font-medium text-red disabled:opacity-60">
                      <X size={14} /> 驳回
                    </button>
                  </div>
                </>
              ) : selected.type === "founder_confirmation" ? (
                <>
                  <p className="mt-3 text-[12.5px] leading-6 text-ink-2">后补流程派发需要发起人确认后才进入审批。</p>
                  <button onClick={() => void confirmDispatch()} disabled={busy}
                    className="mt-3 flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3.5 text-[12.5px] font-medium text-canvas disabled:opacity-60">
                    <Check size={14} /> 确认后补内容
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-3 text-[12.5px] leading-6 text-ink-2">
                    {selected.desc || "该消息没有附加说明。"}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="h-9 flex-1 rounded-sm border border-border px-3 text-[12.5px] outline-none placeholder:text-ink-3 focus:border-ink-4"
                      placeholder="处理说明（可选）"
                    />
                    <button onClick={() => void complete()} disabled={busy}
                      className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3.5 text-[12.5px] font-medium text-canvas disabled:opacity-60">
                      标记完成
                    </button>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
