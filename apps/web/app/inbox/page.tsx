"use client";

import React, { useState } from "react";
import { Paperclip, Check, X } from "lucide-react";
import { Shell } from "@/components/shell";
import {
  Card, Badge, Avatar, PageHeader, Empty,
} from "@/components/ui";
import type { InboxItem } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { cx, str,avatarColor } from "@/lib/utils";

const KIND_COLOR: Record<string, string> = {
  审批: "#d92d20", 指派: "#2563eb", 提及: "#6d5bd0", 冲突: "#b87407", 系统: "#86868f",
};

const FILTERS = ["全部", "审批", "指派", "@ 提及", "系统"];

type InboxRow=Omit<InboxItem,"kind"> & {kind:string};
function normalize(items: Record<string,unknown>[]): InboxRow[] {
 return items.map((x):InboxRow=>({id:str(x.id),title:str(x.title),desc:str(x.desc,str(x.message,"—")),kind:str(x.kind,str(x.type,"—")),actor:str(x.actor,str(x.created_by,"—")),actorColor:avatarColor(str(x.created_by)),time:str(x.created_at,"—")}));
}

export default function InboxPage() {
  const query=useData<unknown[]>("inbox", "/inbox"),state=recordQueryState(query,"title");
  const [filter, setFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState<string|null>(null);
  if(state.kind!=="ready")return <Shell><PageHeader title="收件箱" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无消息" /></Shell>;
  const items=normalize(state.items);
  const shown = items.filter((m) => filter === "全部" || m.kind === filter.replace("@ ", ""));
  const selected = shown.find((m) => m.id === selectedId) || shown[0];

  return (
    <Shell>
      <PageHeader
        title="收件箱"
        sub={`已加载 ${items.length} 条消息`}
        right={<button className="text-[12.5px] font-medium text-ink-2 hover:text-ink">全部标为已读</button>}
      />

      <div className="grid grid-cols-[1.1fr_1.4fr] gap-0">
        {/* 列表 */}
        <div className="border-r border-border">
          <div className="flex gap-2 px-5 py-3">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cx(
                  "h-7 rounded-full px-3 text-[12.5px]",
                  filter === f ? "bg-ink font-medium text-white" : "border border-border bg-panel text-ink-2 hover:bg-fill",
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
                onClick={() => setSelectedId(m.id)}
                className={cx(
                  "flex items-start gap-3 border-b border-border/60 px-5 py-3.5 text-left",
                  selected?.id === m.id ? "bg-accent-soft/50" : "hover:bg-canvas",
                )}
              >
                <Avatar name={m.actor} color={m.actorColor} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge color={KIND_COLOR[m.kind]}>{m.kind === "提及" ? "@ 提及" : m.kind}</Badge>
                    <span className="truncate text-[12.5px] font-medium text-ink">{m.title}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-2">{m.desc}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">{m.actor} · {m.time}</p>
                </div>
              </button>
            ))}
            {shown.length===0 && <Empty text="没有符合条件的消息" />}
          </div>
        </div>

        {/* 详情 */}
        <div className="p-5">
          {!selected ? <Empty text="选择一条消息查看" /> : selected.detail ? (
            <>
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <Badge color={KIND_COLOR[selected.kind]}>{selected.kind}</Badge>
                  <h2 className="text-[15px] font-semibold">{selected.title}</h2>
                  {selected.overdue && <Badge color="#b87407">{selected.overdue}</Badge>}
                  <span className="ml-auto text-[11.5px] text-ink-3">发起人 {selected.actor} · 提交于 6/18 16:20</span>
                </div>
                <p className="mt-3 text-[12.5px] leading-6 text-ink-2">
                  项目概述：面向北线 3 个站场的调度优化，覆盖排产算法、车辆路径与人员排班。计划周期 6/01 - 8/15，涉及市场与研发两个部门协同。立项书包含预算、人员计划与风险评估，详细内容见附件…
                </p>
                <div className="mt-4 grid grid-cols-4 gap-3 rounded-md bg-fill/60 p-3.5">
                  {selected.detail.meta.map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[11.5px] text-ink-3">{k}</p>
                      <p className="mt-0.5 text-[13px] font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11.5px] text-ink-3">附件</span>
                  {selected.detail.attachments.map((a) => (
                    <span key={a} className="flex h-7 items-center gap-1.5 rounded-sm border border-border px-2 text-[11.5px] text-ink-2">
                      <Paperclip size={12} /> {a}
                    </span>
                  ))}
                </div>
                <p className="mt-4 mb-1.5 text-[11.5px] text-ink-3">审批意见</p>
                <input
                  className="h-9 w-full rounded-sm border border-border px-3 text-[12.5px] outline-none placeholder:text-ink-3 focus:border-accent"
                  placeholder="填写审批意见（可选）…"
                />
                <div className="mt-3 flex gap-2">
                  <button className="flex h-8 items-center gap-1.5 rounded-sm bg-green px-3.5 text-[12.5px] font-medium text-white">
                    <Check size={14} /> 通过
                  </button>
                  <button className="flex h-8 items-center gap-1.5 rounded-sm border border-red/50 px-3.5 text-[12.5px] font-medium text-red">
                    <X size={14} /> 驳回
                  </button>
                  <button className="h-8 rounded-sm border border-border px-3.5 text-[12.5px] text-ink-2">转交他人</button>
                </div>
              </Card>

              <Card className="mt-3 p-5">
                <h3 className="mb-2 text-[13.5px] font-semibold">流转记录</h3>
                {selected.detail.flow.map((f) => (
                  <div key={f.name} className="flex items-center gap-2.5 border-b border-border/60 py-2.5 last:border-0">
                    <Avatar name={f.name} color={f.color} size={26} />
                    <span className="text-[12.5px] font-medium">{f.name}</span>
                    <span className="text-[12.5px] text-ink-3">{f.action}</span>
                    <span className="ml-auto text-[11.5px] text-ink-3 tabular-nums">{f.time}</span>
                  </div>
                ))}
              </Card>
            </>
          ) : (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Badge color={KIND_COLOR[selected?.kind || "系统"]}>{selected?.kind}</Badge>
                <h2 className="text-[15px] font-semibold">{selected?.title}</h2>
              </div>
              <p className="mt-3 text-[12.5px] text-ink-2">{selected?.desc}</p>
              <p className="mt-2 text-[11.5px] text-ink-3">{selected?.actor} · {selected?.time}</p>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
