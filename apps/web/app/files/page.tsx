"use client";

import React, { useState } from "react";
import {
  FolderOpen, FileText, FileBarChart, Presentation, FileBadge, Database, NotebookPen, Star, Trash2,
  Upload, Download, File, FileSpreadsheet, FileVideo, FileImage,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, PageHeader, SearchBox, Marker } from "@/components/ui";
import { FILES, FileItem } from "@/lib/demo";
import { useData } from "@/lib/data";
import { cx, str } from "@/lib/utils";

function FilesSidebar() {
  return (
    <>
      <SideSection title="资料目录">
        <SideItem icon={<FolderOpen size={14} className="text-accent" />} label="全部资料" count={1284} active />
        <SideItem icon={<FileText size={14} />} label="个人报告" count={312} />
        <SideItem icon={<FileBarChart size={14} />} label="整体报告" count={86} />
        <SideItem icon={<Presentation size={14} className="text-orange" />} label="汇报 PPT" count={154} />
        <SideItem icon={<FileBadge size={14} className="text-purple" />} label="申报报告" count={42} />
        <SideItem icon={<Database size={14} className="text-blue" />} label="数据集" count={230} />
        <SideItem icon={<NotebookPen size={14} />} label="会议纪要" count={178} />
      </SideSection>
      <SideSection title="按项目">
        <SideItem icon={<Marker color="#F2970A" />} label="智慧油田数据平台" count={486} />
        <SideItem icon={<Marker color="#2FB365" shape="square" />} label="巡检机器人研发" count={204} />
        <SideItem icon={<Marker color="#9B59F5" shape="square" />} label="等保测评专项" count={97} />
      </SideSection>
      <SideSection title="其他">
        <SideItem icon={<Star size={14} className="text-orange" />} label="我的收藏" count={12} />
        <SideItem icon={<Trash2 size={14} />} label="回收站" />
      </SideSection>
    </>
  );
}

const FTYPE_ICON: Record<string, { icon: React.ComponentType<{ size?: number | string }>; color: string }> = {
  pdf: { icon: FileText, color: "#EE4B43" },
  word: { icon: FileText, color: "#3B82F6" },
  ppt: { icon: Presentation, color: "#F2970A" },
  excel: { icon: FileSpreadsheet, color: "#2FB365" },
  data: { icon: Database, color: "#3B82F6" },
  video: { icon: FileVideo, color: "#9B59F5" },
  image: { icon: FileImage, color: "#EC4899" },
  other: { icon: File, color: "#878C94" },
};

const FILTERS = ["全部类型", "Word", "PPT", "PDF", "Excel", "数据"];

function normalize(items: unknown[]): FileItem[] {
  const rows = items
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.name === "string")
    .map((x, i) => {
      const demo = FILES.find((f) => f.name === x.name) || FILES[i % FILES.length];
      const name = str(x.name, demo.name);
      return { ...demo, id: str(x.id, demo.id), name, attr: str(x.category, demo.attr), uploader: str(x.uploader, demo.uploader) } as FileItem;
    });
  return rows.length ? rows : FILES;
}

export default function FilesPage() {
  const { data } = useData<unknown[]>("files", "/files", FILES);
  const files = normalize(Array.isArray(data) ? data : FILES);
  const [filter, setFilter] = useState("全部类型");

  return (
    <Shell sidebar={<FilesSidebar />}>
      <PageHeader
        title="资料库"
        extra={
          <>
            <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-3">1,284 份</span>
            <span className="text-[12px] text-ink-3">智慧油田数据平台 / 开发实施</span>
          </>
        }
        right={
          <>
            <SearchBox placeholder="搜索文件名 / 上传人" className="w-56" />
            <button className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
              <Upload size={14} /> 上传资料
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[240px_1fr] gap-3 p-7 pt-4">
        {/* 目录 */}
        <Card className="self-start p-4">
          <h3 className="text-[13.5px] font-semibold">目录</h3>
          <p className="mt-0.5 mb-2 text-[10.5px] text-ink-4">按任务归档 · 资料 + 属性</p>
          {[
            { icon: FolderOpen, name: "全部资料", count: 1284 },
            { icon: FileText, name: "个人报告", count: 312 },
            { icon: FileBarChart, name: "整体报告", count: 86 },
            { icon: Presentation, name: "汇报 PPT", count: 154 },
            { icon: FileBadge, name: "申报报告", count: 42 },
            { icon: Database, name: "数据集", count: 230 },
            { icon: NotebookPen, name: "会议纪要", count: 178 },
          ].map((d, i) => (
            <div key={d.name} className={cx("flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px]", i === 0 ? "text-ink" : "text-ink-2 hover:bg-fill")}>
              <d.icon size={13} className="text-ink-3" />
              <span className="flex-1">{d.name}</span>
              <span className="text-[11px] text-ink-4">{d.count}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-fill">
            <FolderOpen size={13} className="text-ink-3" />
            <span className="flex-1">代码仓库</span>
            <span className="text-[11px] text-ink-4">—</span>
          </div>
        </Card>

        {/* 文件列表 */}
        <div>
          <div className="mb-3 flex items-center gap-2">
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
            <span className="ml-auto text-[11.5px] text-ink-3">按 上传时间 ↓</span>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] text-ink-4">
                  <th className="px-5 py-2.5 font-medium">文件名称</th>
                  <th className="px-3 py-2.5 font-medium">属性</th>
                  <th className="px-3 py-2.5 font-medium">所属任务</th>
                  <th className="px-3 py-2.5 font-medium">上传人</th>
                  <th className="px-3 py-2.5 font-medium">时间</th>
                  <th className="px-3 py-2.5 text-right font-medium">大小</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const fi = FTYPE_ICON[f.ftype] || FTYPE_ICON.other;
                  return (
                    <tr key={f.id} className="border-b border-border/60 last:border-0 hover:bg-canvas">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-[7px]" style={{ background: `${fi.color}14`, color: fi.color }}>
                            <fi.icon size={14} />
                          </span>
                          <span className="font-medium text-ink">{f.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3"><Badge color={f.attrColor}>{f.attr}</Badge></td>
                      <td className="px-3 py-3 text-ink-2">{f.task}</td>
                      <td className="px-3 py-3 text-ink-2">{f.uploader}</td>
                      <td className="px-3 py-3 text-[11.5px] text-ink-3">{f.time}</td>
                      <td className="px-3 py-3 text-right text-[11.5px] text-ink-3 tabular-nums">{f.size}</td>
                      <td className="px-3 py-3 text-ink-4"><Download size={14} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
