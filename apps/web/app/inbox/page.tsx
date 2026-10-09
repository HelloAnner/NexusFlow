"use client";

import React, { useState } from "react";
import {
  Inbox as InboxIcon, Stamp, Send, AtSign, AlertTriangle, Bell, Archive, CheckCheck,
  Paperclip, Check, X,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, Avatar, PageHeader, Marker } from "@/components/ui";
import { INBOX, InboxItem } from "@/lib/demo";
import { useData } from "@/lib/data";
import { cx, str } from "@/lib/utils";

const KIND_COLOR: Record<string, string> = {
  审批: "#EE4B43", 指派: "#3B82F6", 提及: "#9B59F5", 冲突: "#F2970A", 系统: "#878C94",
};

function InboxSidebar() {
  return (
    <>
      <SideSection title="消息分类">
        <SideItem icon={<InboxIcon size={14} className="text-accent" />} label="全部" count={17} active />
        <SideItem icon={<Stamp size={14} className="text-red" />} label="审批" count={4} />
        <SideItem icon={<Send size={14} className="text-blue" />} label="指派" count={5} />
        <SideItem icon={<AtSign size={14} className="text-purple" />} label="@ 提及" count={2} />
        <SideItem icon={<AlertTriangle size={14} className="text-orange" />} label="冲突预警" count={3} />
        <SideItem icon={<Bell size={14} />} label="系统通知" count={3} />
      </SideSection>
      <SideSection title="按项目">
        <SideItem icon={<Marker color="#F2970A" />} label="智慧油田数据平台" count={8} />
        <SideItem icon={<Marker color="#9B59F5" shape="square" />} label="等保测评专项" count={4} />
        <SideItem icon={<Marker color="#F2970A" shape="square" />} label="北线调度优化" count={3} />
      </SideSection>
      <SideSection title="其他">
        <SideItem icon={<Archive size={14} />} label="已归档" />
        <SideItem icon={<CheckCheck size={14} className="text-green" />} label="全部标为已读" />
      </SideSection>
    </>
  );
}

const FILTERS = ["全部", "审批", "指派", "@ 提及", "系统"];

function normalize(items: unknown[]): InboxItem[] {
  const rows = items
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.title === "string")
    .map((x, i) => {
      const demo = INBOX[i % INBOX.length];
      return {
        ...demo,
        id: str(x.id, demo.id),
        title: str(x.title, demo.title),
        desc: str(x.desc, demo.desc),
        kind: str(x.kind, demo.kind) as InboxItem["kind"],
      } as InboxItem;
    });
  return rows.length ? rows : INBOX;
}

export default function InboxPage() {
  const { data } = useData<unknown[]>("inbox", "/inbox", INBOX);
  const items = normalize(Array.isArray(data) ? data : INBOX);
  const [filter, setFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState("i1");
  const shown = items.filter((m) => filter === "全部" || m.kind === filter.replace("@ ", ""));
  const selected = items.find((m) => m.id === selectedId) || items[0];

  return (
    <Shell sidebar={<InboxSidebar />}>
      <PageHeader
        title="收件箱"
        extra={<Badge color="#EE4B43">17 未读</Badge>}
        right={<button className="text-[12.5px] text-accent">全部标为已读</button>}
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
                  "h-7 rounded-full px-3 text-[12px]",
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
                  <p className="mt-0.5 text-[10.5px] text-ink-4">{m.actor} · {m.time}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 详情 */}
        <div className="p-5">
          {selected?.detail ? (
            <>
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <Badge color={KIND_COLOR[selected.kind]}>{selected.kind}</Badge>
                  <h2 className="text-[15px] font-semibold">{selected.title}</h2>
                  {selected.overdue && <Badge color="#F2970A">{selected.overdue}</Badge>}
                  <span className="ml-auto text-[11px] text-ink-4">发起人 {selected.actor} · 提交于 6/18 16:20</span>
                </div>
                <p className="mt-3 text-[12.5px] leading-6 text-ink-2">
                  项目概述：面向北线 3 个站场的调度优化，覆盖排产算法、车辆路径与人员排班。计划周期 6/01 - 8/15，涉及市场与研发两个部门协同。立项书包含预算、人员计划与风险评估，详细内容见附件…
                </p>
                <div className="mt-4 grid grid-cols-4 gap-3 rounded-md bg-fill/60 p-3.5">
                  {selected.detail.meta.map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[10.5px] text-ink-4">{k}</p>
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
                  className="h-9 w-full rounded-sm border border-border px-3 text-[12.5px] outline-none placeholder:text-ink-4 focus:border-accent"
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
                    <span className="text-[12px] text-ink-3">{f.action}</span>
                    <span className="ml-auto text-[11px] text-ink-4 tabular-nums">{f.time}</span>
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
              <p className="mt-2 text-[11px] text-ink-4">{selected?.actor} · {selected?.time}</p>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
