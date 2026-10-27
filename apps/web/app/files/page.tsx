"use client";

import React, { useState } from "react";
import {
  FolderOpen, FileText, FileBarChart, Presentation, FileBadge, Database,
  NotebookPen, Upload, Download, File, FileSpreadsheet, FileVideo,
  FileImage,
} from "lucide-react";
import { Shell } from "@/components/shell";
import {
  Card, Badge, PageHeader, SearchBox,
} from "@/components/ui";
import type { FileItem } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState,measured } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { cx, str } from "@/lib/utils";

const FTYPE_ICON: Record<string, { icon: React.ComponentType<{ size?: number | string }>; color: string }> = {
  pdf: { icon: FileText, color: "#d92d20" },
  word: { icon: FileText, color: "#2563eb" },
  ppt: { icon: Presentation, color: "#b87407" },
  excel: { icon: FileSpreadsheet, color: "#12855a" },
  data: { icon: Database, color: "#2563eb" },
  video: { icon: FileVideo, color: "#6d5bd0" },
  image: { icon: FileImage, color: "#b04a7c" },
  other: { icon: File, color: "#86868f" },
};

const FILTERS = ["全部类型", "Word", "PPT", "PDF", "Excel", "数据"];

type FileRow=Omit<FileItem,"ftype"> & {ftype:string};
function normalize(items: Record<string,unknown>[]): FileRow[] {
 return items.map((x):FileRow=>({id:str(x.id),name:str(x.name),attr:str(x.category,"—"),attrColor:"#86868f",task:str(x.task,str(x.task_id,"—")),uploader:str(x.uploader,str(x.uploaded_by,"—")),time:str(x.created_at,"—"),size:measured(x.size_bytes)!==undefined?`${x.size_bytes} B`:"—",ftype:str(x.ftype,"other")}));
}

export default function FilesPage() {
  const query=useData<unknown[]>("files", "/files"),state=recordQueryState(query);
  const [filter, setFilter] = useState("全部类型");
  if(state.kind!=="ready")return <Shell><PageHeader title="资料库" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无资料" /></Shell>;
  const files=normalize(state.items);

  return (
    <Shell>
      <PageHeader
        title="资料库"
        sub={`当前可见资料 ${files.length} 份`}
        right={
          <>
            <SearchBox placeholder="搜索文件名 / 上传人" className="w-56" />
            <button className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
              <Upload size={14} /> 上传资料
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[240px_1fr] gap-3 p-6 pt-4">
        {/* 目录 */}
        <Card className="self-start p-4">
          <h3 className="text-[13.5px] font-semibold">目录</h3>
          <p className="mt-0.5 mb-2 text-[11.5px] text-ink-3">按任务归档 · 资料 + 属性</p>
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
              <span className="text-[11.5px] text-ink-3">{d.count}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-fill">
            <FolderOpen size={13} className="text-ink-3" />
            <span className="flex-1">代码仓库</span>
            <span className="text-[11.5px] text-ink-3">—</span>
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
                  "h-7 rounded-full px-3 text-[12.5px]",
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
                <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
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
                      <td className="px-3 py-3 text-ink-3"><Download size={14} /></td>
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
