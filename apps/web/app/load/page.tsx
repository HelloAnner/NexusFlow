"use client";

import React from "react";
import {
  Users2, AlertTriangle, Flame, Loader, CheckCircle2, Lock, LayoutGrid, List, ChevronLeft, ChevronRight, Download,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, Avatar, PageHeader } from "@/components/ui";
import { LOAD_DAYS, LOAD_MATRIX, LOAD_CONFLICTS } from "@/lib/demo";
import { useData } from "@/lib/data";
import { cx } from "@/lib/utils";

function LoadSidebar() {
  return (
    <>
      <SideSection title="部门视图">
        <SideItem icon={<Users2 size={14} className="text-accent" />} label="软件研发部" count={24} active />
        <SideItem icon={<Users2 size={14} />} label="数据科学部" count={18} />
        <SideItem icon={<Users2 size={14} />} label="运维保障部" count={12} />
        <SideItem icon={<Users2 size={14} />} label="全中心" count={86} />
      </SideSection>
      <SideSection title="状态筛选">
        <SideItem icon={<AlertTriangle size={14} className="text-red" />} label="冲突" count={3} />
        <SideItem icon={<Flame size={14} className="text-orange" />} label="过载" count={5} />
        <SideItem icon={<Loader size={14} className="text-blue" />} label="饱和" count={9} />
        <SideItem icon={<CheckCircle2 size={14} className="text-green" />} label="空闲" count={8} />
        <SideItem icon={<Lock size={14} />} label="全天锁定" count={2} />
      </SideSection>
      <SideSection title="视图">
        <SideItem icon={<LayoutGrid size={14} className="text-accent" />} label="热力图" active />
        <SideItem icon={<List size={14} />} label="列表" />
      </SideSection>
    </>
  );
}

const CELL: Record<string, string> = {
  idle: "#F4F4F2", free: "#E7F6EE", full: "#FCF0DB", over: "#FBE9E7", lock: "#F1F1F0",
};

export default function LoadPage() {
  useData("load-conflicts", "/load/conflicts", LOAD_CONFLICTS);
  return (
    <Shell sidebar={<LoadSidebar />}>
      <PageHeader
        title="负载与冲突"
        extra={
          <>
            <Badge color="#EE4B43">冲突 3</Badge>
            <Badge color="#F2970A">过载 5</Badge>
            <Badge color="#2FB365">空闲 8</Badge>
          </>
        }
        right={
          <>
            <button className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-panel text-ink-2"><ChevronLeft size={14} /></button>
            <button className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-panel text-ink-2"><ChevronRight size={14} /></button>
            <span className="text-[12.5px] text-ink-2 tabular-nums">6/22 - 7/5</span>
            <button className="flex h-8 items-center gap-1.5 rounded-sm border border-border bg-panel px-3 text-[12.5px] text-ink-2">
              <Download size={13} /> 导出
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[1.7fr_1fr] gap-3 p-7 pt-4">
        {/* 热力图 */}
        <Card className="self-start p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">部门负载热力图 · 软件研发部</h3>
            <div className="flex items-center gap-2.5 text-[10.5px] text-ink-3">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: CELL.idle }} />空闲</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px] border border-border bg-panel" />正常</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: CELL.full }} />饱和</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: CELL.over }} />过载</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: CELL.lock }} />全天锁定</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="mb-1 flex">
                <span className="w-[92px] shrink-0" />
                <div className="grid flex-1 grid-cols-14 gap-[4px]" style={{ gridTemplateColumns: `repeat(${LOAD_DAYS.length}, 1fr)` }}>
                  {LOAD_DAYS.map((d) => (
                    <span key={d} className={cx("rounded-[4px] py-0.5 text-center text-[10px]", d === "6/24" ? "bg-accent-soft font-medium text-accent" : "text-ink-4")}>{d}</span>
                  ))}
                </div>
              </div>
              {LOAD_MATRIX.map((r) => (
                <div key={r.name} className="mb-[4px] flex items-center">
                  <span className="flex w-[92px] shrink-0 items-center gap-1.5">
                    <Avatar name={r.name} color={r.color} size={18} />
                    <span className="text-[11.5px] text-ink-2">{r.name}</span>
                  </span>
                  <div className="grid flex-1 gap-[4px]" style={{ gridTemplateColumns: `repeat(${LOAD_DAYS.length}, 1fr)` }}>
                    {r.cells.map((c, i) => (
                      <span
                        key={i}
                        className={cx(
                          "flex h-7 items-center justify-center rounded-[4px] text-[10px]",
                          i === 2 && "ring-1 ring-accent",
                          c === "over" && "font-medium text-red",
                          c === "lock" && "text-ink-3",
                        )}
                        style={{ background: CELL[c] }}
                      >
                        {c === "over" ? "!" : c === "lock" ? "锁" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 待协调冲突 */}
        <Card className="self-start p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">待协调冲突</h3>
            <span className="text-[11px] text-ink-4">按影响排序</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {LOAD_CONFLICTS.map((c) => (
              <div key={c.name} className={cx("rounded-md border p-3", c.urgent ? "border-red/30" : "border-border")}>
                <div className="flex items-center gap-2">
                  <Avatar name={c.name} color={c.color} size={24} />
                  <span className="text-[13px] font-semibold">{c.name}</span>
                  {c.urgent && <Badge color="#EE4B43">紧急</Badge>}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {c.tasks.map((t) => (
                    <p key={t} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                      <span className={cx("h-3 w-[2.5px] rounded-full", c.urgent ? "bg-red" : "bg-orange")} />
                      {t}
                    </p>
                  ))}
                </div>
                <p className={cx("mt-2 text-[11px]", c.urgent ? "text-red" : "text-ink-3")}>{c.impact}</p>
                <div className="mt-2.5 flex gap-2">
                  <button className="h-7 rounded-sm bg-accent px-2.5 text-[11.5px] font-medium text-white">协调排程</button>
                  <button className="h-7 rounded-sm border border-border px-2.5 text-[11.5px] text-ink-2">联系上级</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
