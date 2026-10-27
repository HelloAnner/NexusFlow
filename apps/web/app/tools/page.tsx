"use client";

import React from "react";
import {
  Wrench, FileOutput, Languages, PenLine, Stamp, BookOpen,
  MessageCircle, NotebookPen, CalendarCheck, BarChart3, ArrowUpRight,
} from "lucide-react";
import { Shell } from "@/components/shell";
import {
  Card, Badge, PageHeader, SearchBox,
} from "@/components/ui";
import type { Tool } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState } from "@/lib/query-state";
import { str } from "@/lib/utils";
import { useData } from "@/lib/data";

const ICONS: Record<string, React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>> = {
  "file-output": FileOutput, languages: Languages, "pen-line": PenLine, stamp: Stamp,
  "book-open": BookOpen, "message-circle": MessageCircle, "notebook-pen": NotebookPen,
  "calendar-check": CalendarCheck, "bar-chart-3": BarChart3,
};

function ToolIcon({ tool, size = 34 }: { tool: Tool; size?: number }) {
  const Icon = ICONS[tool.icon] || Wrench;
  return (
    <span
      className="flex items-center justify-center rounded-[9px]"
      style={{ width: size, height: size, background: `${tool.color}14`, color: tool.color }}
    >
      <Icon size={size * 0.47} />
    </span>
  );
}

export default function ToolsPage() {
  const query=useData<unknown[]>("tools", "/tools"),state=recordQueryState(query);
  if(state.kind!=="ready")return <Shell><PageHeader title="智能工具台" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无工具" /></Shell>;
  const tools=state.items.map((x):Tool=>({id:str(x.id),name:str(x.name),desc:str(x.description,str(x.desc,"—")),usage:str(x.usage,"—"),ai:x.category==="agent"||x.ai===true,icon:str(x.icon,"wrench"),color:"#86868f",recent:str(x.recent)}));
  const recent = tools.filter((t) => t.recent);

  return (
    <Shell>
      <PageHeader
        title="智能工具台"
        sub="常用软件工具 + 智能体工具 · 服务日常工作，减轻工作时长"
        right={<SearchBox placeholder="搜索工具" className="w-64" />}
      />

      <div className="p-6 pt-4">
        <p className="mb-2 text-[12.5px] text-ink-3">最近使用</p>
        <div className="grid grid-cols-4 gap-3">
          {recent.map((t) => (
            <Card key={t.id} className="relative cursor-pointer p-4 hover:border-ink-4/40">
              <ArrowUpRight size={14} className="absolute top-4 right-4 text-ink-3" />
              <ToolIcon tool={t} />
              <p className="mt-3 text-[13px] font-semibold">{t.name}</p>
              <p className="mt-1 text-[11.5px] text-ink-3">{t.recent}</p>
            </Card>
          ))}
        </div>

        <p className="mt-5 mb-2 text-[12.5px] text-ink-3">全部工具</p>
        <div className="grid grid-cols-3 gap-3">
          {tools.map((t) => (
            <Card key={t.id} className="relative p-4 hover:border-ink-4/40">
              {t.ai && <span className="absolute top-4 right-4"><Badge color="#6d5bd0">AI 智能体</Badge></span>}
              <ToolIcon tool={t} />
              <p className="mt-3 text-[13.5px] font-semibold">{t.name}</p>
              <p className="mt-1 text-[11.5px] text-ink-3">{t.desc}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11.5px] text-ink-3">{t.usage}</span>
                <button className="flex items-center gap-1 text-[12.5px] font-medium text-accent">
                  打开 <ArrowUpRight size={12} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}
