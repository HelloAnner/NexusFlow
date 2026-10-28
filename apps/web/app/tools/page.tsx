"use client";

import React, { useState } from "react";
import {
  Wrench, FileOutput, Languages, PenLine, Stamp, BookOpen,
  MessageCircle, NotebookPen, CalendarCheck, BarChart3,
} from "lucide-react";
import { Card, Badge, PageHeader, SearchBox, Empty } from "@/components/ui";
import type { Tool } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState } from "@/lib/query-state";
import { soft, str } from "@/lib/utils";
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
      style={{ width: size, height: size, background: soft(tool.color, 8), color: tool.color }}
    >
      <Icon size={size * 0.47} />
    </span>
  );
}

export default function ToolsPage() {
  const query=useData<unknown[]>("tools", "/tools"),state=recordQueryState(query);
  const [q, setQ] = useState("");
  if(state.kind!=="ready")return <><PageHeader title="智能工具台" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无工具" /></>;
  const tools=state.items.map((x):Tool=>({id:str(x.id),name:str(x.name),desc:str(x.description,str(x.desc,"—")),usage:str(x.usage,"—"),ai:x.category==="agent"||x.ai===true,icon:str(x.icon,"wrench"),color:"var(--color-ink-3)",recent:str(x.recent)}));
  const kw = q.trim().toLowerCase();
  const shown = kw ? tools.filter((t) => `${t.name}${t.desc}${t.usage}`.toLowerCase().includes(kw)) : tools;

  return (
    <>
      <PageHeader
        title="智能工具台"
        sub={`可用工具 ${tools.length} 个`}
        right={<SearchBox placeholder="搜索工具" className="w-64" value={q} onChange={setQ} />}
      />

      <div className="flex flex-col gap-3 p-6 pt-4">
        <Card className="p-4">
          <h3 className="text-[13.5px] font-semibold">全部工具</h3>
          <div className="mt-1 flex flex-col">
            {shown.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                <ToolIcon tool={t} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                    <span className="truncate">{t.name}</span>
                    {t.ai && <Badge color="var(--color-purple)">AI 智能体</Badge>}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-3">{t.desc}</p>
                </div>
                <span className="shrink-0 text-[11.5px] text-ink-3">{t.usage}</span>
              </div>
            ))}
            {shown.length === 0 && <Empty text="没有匹配的工具" />}
          </div>
        </Card>
      </div>
    </>
  );
}
