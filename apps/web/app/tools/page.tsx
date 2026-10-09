"use client";

import React from "react";
import {
  LayoutGrid, Wrench, Sparkles, Star, FileOutput, Languages, PenLine, Stamp, BookOpen,
  MessageCircle, NotebookPen, CalendarCheck, BarChart3, ArrowUpRight,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, PageHeader, SearchBox } from "@/components/ui";
import { TOOLS, Tool } from "@/lib/demo";
import { useData } from "@/lib/data";

const ICONS: Record<string, React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>> = {
  "file-output": FileOutput, languages: Languages, "pen-line": PenLine, stamp: Stamp,
  "book-open": BookOpen, "message-circle": MessageCircle, "notebook-pen": NotebookPen,
  "calendar-check": CalendarCheck, "bar-chart-3": BarChart3,
};

function ToolsSidebar() {
  return (
    <>
      <SideSection title="工具分类">
        <SideItem icon={<LayoutGrid size={14} className="text-accent" />} label="全部工具" count={18} active />
        <SideItem icon={<Wrench size={14} />} label="常用工具" count={9} />
        <SideItem icon={<Sparkles size={14} className="text-purple" />} label="智能体工具" count={9} />
        <SideItem icon={<Star size={14} className="text-orange" />} label="我的收藏" count={4} />
      </SideSection>
      <SideSection title="最近使用">
        <SideItem icon={<FileOutput size={14} className="text-red" />} label="PDF 格式转换" count={<span className="text-[10px]">3 次</span>} />
        <SideItem icon={<Languages size={14} className="text-blue" />} label="智能翻译" count={<span className="text-[10px]">1 次</span>} />
        <SideItem icon={<PenLine size={14} className="text-purple" />} label="论文撰写助手" />
        <SideItem icon={<NotebookPen size={14} className="text-orange" />} label="会议纪要生成" />
      </SideSection>
      <SideSection title="智能体">
        <SideItem icon={<PenLine size={14} className="text-purple" />} label="论文撰写助手" />
        <SideItem icon={<Stamp size={14} className="text-orange" />} label="专利撰写助手" />
        <SideItem icon={<BookOpen size={14} className="text-green" />} label="个人知识库" />
        <SideItem icon={<MessageCircle size={14} className="text-blue" />} label="平台问答助手" />
      </SideSection>
    </>
  );
}

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
  // 静态注册表兜底；API /tools 提供真实条目后替换
  const { data } = useData<unknown[]>("tools", "/tools", TOOLS);
  const tools = (Array.isArray(data) && data.length >= TOOLS.length ? data : TOOLS) as Tool[];
  const recent = TOOLS.filter((t) => t.recent);

  return (
    <Shell sidebar={<ToolsSidebar />}>
      <PageHeader
        title={
          <span>
            智能工具台
            <span className="ml-3 text-[12px] font-normal text-ink-3">常用软件工具 + 智能体工具 · 服务日常工作，减轻工作时长</span>
          </span>
        }
        right={<SearchBox placeholder="搜索工具" className="w-64" />}
      />

      <div className="p-7 pt-4">
        <p className="mb-2 text-[12px] text-ink-3">最近使用</p>
        <div className="grid grid-cols-4 gap-3">
          {recent.map((t) => (
            <Card key={t.id} className="relative cursor-pointer p-4 hover:border-ink-4/40">
              <ArrowUpRight size={14} className="absolute top-4 right-4 text-ink-4" />
              <ToolIcon tool={t} />
              <p className="mt-3 text-[13px] font-semibold">{t.name}</p>
              <p className="mt-1 text-[11px] text-ink-4">{t.recent}</p>
            </Card>
          ))}
        </div>

        <p className="mt-5 mb-2 text-[12px] text-ink-3">全部工具</p>
        <div className="grid grid-cols-3 gap-3">
          {tools.map((t) => (
            <Card key={t.id} className="relative p-4 hover:border-ink-4/40">
              {t.ai && <span className="absolute top-4 right-4"><Badge color="#9B59F5">AI 智能体</Badge></span>}
              <ToolIcon tool={t} />
              <p className="mt-3 text-[13.5px] font-semibold">{t.name}</p>
              <p className="mt-1 text-[11.5px] text-ink-3">{t.desc}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-ink-4">{t.usage}</span>
                <button className="flex items-center gap-1 text-[12px] font-medium text-accent">
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
