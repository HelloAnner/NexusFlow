"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Shell } from "@/components/shell";
import {
  Card, Badge, Avatar, Bar, Marker, PageHeader,
  SearchBox, Empty, TYPE_COLOR,
} from "@/components/ui";
import type { Project } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState,measured } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { cx, str, md, avatarColor } from "@/lib/utils";
import { projectStatusColor, projectStatusText } from "@/lib/home";

const TYPES = ["科研", "市场", "出差", "文职", "党建", "学习", "休假"];
const LEVELS = ["公司级", "处级", "中心级"];

type ProjectRow = Omit<Project,"progress"> & {progress?:number;members?:string[]};
function normalize(items: Record<string,unknown>[]): ProjectRow[] {
 return items.map((x):ProjectRow=>({id:str(x.id),name:str(x.name),type:str(x.type,"—"),level:str(x.level),owner:str(x.owner,str(x.owner_id,"—")),ownerColor:avatarColor(str(x.owner_id)),start:str(x.start_date),end:str(x.end_date),progress:measured(x.progress),status:str(x.status,"—"),updated:str(x.updated_at,"—"),marker:"circle",color:"#86868f",members:Array.isArray(x.member_ids)?x.member_ids.filter((id):id is string=>typeof id==="string"):undefined}));
}

function progressColor(p: ProjectRow): string {
  if (p.status === "完成" || (p.progress !== undefined && p.progress >= 100)) return "#a8a8b0";
  if (p.status === "逾期") return "#12855a";
  if (p.type === "市场") return "#6d5bd0";
  if (p.type === "文职") return "#2563eb";
  return "#12855a";
}

export default function ProjectsPage() {
  const router = useRouter();
  const query = useData<unknown[]>("projects", "/projects"),state=recordQueryState(query);
  const [type, setType] = useState("全部");
  const [level, setLevel] = useState("");
  if(state.kind!=="ready")return <Shell><PageHeader title="项目" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无项目" /></Shell>;
  const projects=normalize(state.items);
  const shown = projects.filter((p) => (type === "全部" || p.type === type) && (!level || p.level === level));

  return (
    <Shell>
      <PageHeader
        title="项目"
        sub={`共 ${shown.length} 个项目`}
        right={
          <>
            <SearchBox placeholder="搜索项目名称 / 负责人" className="w-64" />
            <button className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
              <Plus size={14} /> 新建项目
            </button>
          </>
        }
      />
      {/* 筛选条 */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-2.5">
        {["全部", ...TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cx(
              "h-7 rounded-full px-3 text-[12.5px]",
              type === t ? "bg-ink font-medium text-white" : "border border-border bg-panel text-ink-2 hover:bg-fill",
            )}
          >
            {t}
          </button>
        ))}
        <span className="ml-3 text-[12.5px] text-ink-3">级别：</span>
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(level === l ? "" : l)}
            className={cx(
              "h-7 rounded-full px-3 text-[12.5px]",
              level === l ? "bg-ink font-medium text-white" : "border border-border bg-panel text-ink-2 hover:bg-fill",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="p-6 pt-4">
        <Card className="overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">项目名称</th>
                <th className="px-3 py-2.5 font-medium">类型</th>
                <th className="px-3 py-2.5 font-medium">负责人</th>
                <th className="px-3 py-2.5 font-medium">起止时间</th>
                <th className="w-[16%] px-3 py-2.5 font-medium">进度</th>
                <th className="px-3 py-2.5 font-medium">成员</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-5 py-2.5 text-right font-medium">更新</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/projects/${p.id}/plan`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-canvas"
                >
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2.5 font-medium text-ink">
                      <Marker color={p.color} shape={p.marker} />
                      {p.name}
                    </span>
                  </td>
                  <td className="px-3 py-3"><Badge color={TYPE_COLOR[p.type] || "#86868f"}>{p.type}</Badge></td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      <Avatar name={p.owner} color={p.ownerColor} size={22} />
                      <span className="text-ink-2">{p.owner}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-ink-3 tabular-nums">{md(p.start)} - {md(p.end)}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      {p.progress !== undefined ? <><Bar value={p.progress} color={progressColor(p)} height={4} /><span className="w-8 shrink-0 text-right text-[11.5px] text-ink-3 tabular-nums">{p.progress}%</span></> : <span className="text-ink-3">—</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex -space-x-1.5">
                      {p.members ? p.members.map((c, i) => (
                        <span
                          key={i}
                          className="flex h-5 w-5 items-center justify-center rounded-[5px] border border-panel text-[9px] font-semibold"
                          style={{ background: `${avatarColor(c)}1A`, color: avatarColor(c) }}
                        >
                          {c.slice(0,1)}
                        </span>
                      )) : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3"><Badge color={projectStatusColor(p.status)}>{projectStatusText(p.status)}</Badge></td>
                  <td className="px-5 py-3 text-right text-[11.5px] text-ink-3">{p.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <Empty text="没有符合条件的项目" />}
        </Card>
      </div>
    </Shell>
  );
}
