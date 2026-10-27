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

      <div className="flex flex-col gap-3 p-6 pt-4">
        {recent.length > 0 && <Card className="p-4">
          <h3 className="text-[13.5px] font-semibold">最近使用</h3>
          <div className="mt-1 flex flex-col">
            {recent.map((t) => (
              <button key={t.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 text-left last:border-0 hover:bg-fill">
                <ToolIcon tool={t} size={28} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{t.name}</span>
                <span className="text-[11.5px] text-ink-3">{t.recent}</span>
                <ArrowUpRight size={14} className="shrink-0 text-ink-3" />
              </button>
            ))}
          </div>
        </Card>}

        <Card className="p-4">
          <h3 className="text-[13.5px] font-semibold">全部工具</h3>
          <div className="mt-1 flex flex-col">
            {tools.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0 hover:bg-fill">
                <ToolIcon tool={t} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                    <span className="truncate">{t.name}</span>
                    {t.ai && <Badge color="#6d5bd0">AI 智能体</Badge>}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-3">{t.desc}</p>
                </div>
                <span className="shrink-0 text-[11.5px] text-ink-3">{t.usage}</span>
                <button className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-accent">
                  打开 <ArrowUpRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
