"use client";

import React, { useState } from "react";
import {
  FolderOpen, FileText, Presentation, Database, Upload, Download, File, FileSpreadsheet,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { Card, Badge, PageHeader, SearchBox, Empty } from "@/components/ui";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { api, apiBase, token } from "@/lib/api";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";
import { cx, str } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  "personal-report": "个人报告",
  "overall-report": "整体报告",
  presentation: "汇报 PPT",
  "application-report": "申报报告",
  dataset: "数据集",
  minutes: "会议纪要",
};

type Ft = "pdf" | "word" | "ppt" | "excel" | "image" | "other";
const FTYPE: Record<Ft, { icon: React.ComponentType<{ size?: number | string }>; color: string; label: string }> = {
  pdf: { icon: FileText, color: "#d92d20", label: "PDF" },
  word: { icon: FileText, color: "#2563eb", label: "Word" },
  ppt: { icon: Presentation, color: "#b87407", label: "PPT" },
  excel: { icon: FileSpreadsheet, color: "#12855a", label: "Excel" },
  image: { icon: File, color: "#b04a7c", label: "图片" },
  other: { icon: File, color: "#86868f", label: "其他" },
};

const FILTERS = ["全部类型", "Word", "PPT", "PDF", "Excel", "图片"];

type FileRow = {
  id: string; name: string; category: string; categoryLabel: string; contentType: string;
  uploader: string; time: string; size: string; ft: Ft;
};

const fileType = (contentType: string): Ft => {
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("presentation")) return "ppt";
  if (contentType.includes("spreadsheet")) return "excel";
  if (contentType.includes("wordprocessing")) return "word";
  if (contentType.startsWith("image/")) return "image";
  return "other";
};

const fmtSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

function normalize(items: Record<string, unknown>[]): FileRow[] {
  return items.map((x) => {
    const contentType = str(x.content_type, "");
    const category = str(x.category, "");
    return {
      id: str(x.id),
      name: str(x.name, "未命名文件"),
      category,
      categoryLabel: CATEGORY_LABEL[category] ?? category ?? "—",
      contentType,
      uploader: str(x.uploader, str(x.uploaded_by, "—")),
      time: str(x.created_at, "—").slice(0, 10),
      size: Number.isFinite(Number(x.size_bytes)) ? fmtSize(Number(x.size_bytes)) : "—",
      ft: fileType(contentType),
    };
  });
}

export default function FilesPage() {
  const query=useData<unknown[]>("files", "/files"),state=recordQueryState(query);
  const [filter, setFilter] = useState("全部类型");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("personal-report");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  if(state.kind!=="ready")return <Shell><PageHeader title="资料库" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无资料" /></Shell>;
  const files=normalize(state.items);
  const counts = files.reduce<Record<string, number>>((acc, f) => { if (f.category) acc[f.category] = (acc[f.category] ?? 0) + 1; return acc; }, {});
  const kw = q.trim().toLowerCase();
  const shown = files.filter((f) =>
    (!category || f.category === category) &&
    (filter === "全部类型" || FTYPE[f.ft].label === filter) &&
    (!kw || `${f.name}${f.uploader}`.toLowerCase().includes(kw)));

  const upload = async () => {
    if (!file) return toast("请选择文件", "err");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", uploadCategory);
      await api("/files/upload", { method: "POST", body: fd });
      toast("上传成功");
      setUploading(false);
      setFile(null);
      await query.refetch();
    } catch (e) { toast(errorText(e), "err"); } finally { setSaving(false); }
  };

  const download = async (row: FileRow) => {
    try {
      const t = token();
      const res = await fetch(`${apiBase()}/api/files/${row.id}/download`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = row.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast("下载失败", "err"); }
  };

  return (
    <Shell>
      <PageHeader
        title="资料库"
        sub={`当前可见资料 ${files.length} 份`}
        right={
          <>
            <SearchBox placeholder="搜索文件名 / 上传人" className="w-56" value={q} onChange={setQ} />
            <button onClick={() => setUploading(true)} className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
              <Upload size={14} /> 上传资料
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-3 p-6 pt-4">
        {/* 目录 */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">目录</h3>
            <span className="text-[11.5px] text-ink-3">按资料属性归档</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategory("")}
              className={cx("flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px]",
                category === "" ? "bg-ink font-medium text-white" : "border border-border text-ink-2 hover:bg-fill")}
            >
              <FolderOpen size={13} />
              <span>全部资料</span>
              <span className={cx("text-[11px]", category === "" ? "text-white/70" : "text-ink-3")}>{files.length}</span>
            </button>
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategory(category === key ? "" : key)}
                className={cx("flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px]",
                  category === key ? "bg-ink font-medium text-white" : "border border-border text-ink-2 hover:bg-fill")}
              >
                <span>{label}</span>
                <span className={cx("text-[11px]", category === key ? "text-white/70" : "text-ink-3")}>{counts[key] ?? 0}</span>
              </button>
            ))}
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
            <span className="ml-auto text-[11.5px] text-ink-3">按上传时间排序</span>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                  <th className="px-5 py-2.5 font-medium">文件名称</th>
                  <th className="px-3 py-2.5 font-medium">属性</th>
                  <th className="px-3 py-2.5 font-medium">上传人</th>
                  <th className="px-3 py-2.5 font-medium">时间</th>
                  <th className="px-3 py-2.5 text-right font-medium">大小</th>
                  <th className="w-16 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => {
                  const fi = FTYPE[f.ft];
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
                      <td className="px-3 py-3"><Badge color="#4a4a52">{f.categoryLabel}</Badge></td>
                      <td className="px-3 py-3 text-ink-2">{f.uploader}</td>
                      <td className="px-3 py-3 text-[11.5px] text-ink-3">{f.time}</td>
                      <td className="px-3 py-3 text-right text-[11.5px] text-ink-3 tabular-nums">{f.size}</td>
                      <td className="px-3 py-3 text-right">
                        <button onClick={() => void download(f)} aria-label={`下载 ${f.name}`} className="text-ink-3 hover:text-ink">
                          <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <Empty text="没有符合条件的资料" />}
          </Card>
        </div>
      </div>

      <Modal
        open={uploading}
        title="上传资料"
        onClose={() => { setUploading(false); setFile(null); }}
        footer={<>
          <button onClick={() => { setUploading(false); setFile(null); }} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void upload()} disabled={saving || !file} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white disabled:opacity-60">{saving ? "上传中…" : "上传"}</button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <Field label="选择文件">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[12px] text-ink-2 file:mr-2 file:rounded-[6px] file:border file:border-border file:bg-panel file:px-2 file:py-1 file:text-[12px]"
            />
          </Field>
          <Field label="资料属性">
            <select className={inputCls} value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
              {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          <p className="text-[11.5px] leading-5 text-ink-3">同一文件重复上传会自动形成新版本；超过大小上限时会被拒绝。</p>
        </div>
      </Modal>
    </Shell>
  );
}
