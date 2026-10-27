"use client";

import React, { useState } from "react";
import {
  Building2, Users2, UserPlus, ChevronRight,
} from "lucide-react";
import { Shell } from "@/components/shell";
import {
  Card, Badge, Avatar, Bar, PageHeader, SearchBox,
  Empty, STATUS_COLOR,
} from "@/components/ui";
import { ORG_TREE,type Person } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState,measured } from "@/lib/query-state";
import { useData } from "@/lib/data";
import { cx, str, avatarColor } from "@/lib/utils";

const SKILLS = ["全部", "前端", "后端", "Python", "Go", "报告撰写", "PPT 制作", "需求对接", "运维"];

type PersonRow=Omit<Person,"load"|"skills"|"projects"> & {load?:number;skills?:string[];projects?:string[]};
function normalize(items: Record<string,unknown>[]): PersonRow[] {
 return items.map((x):PersonRow=>({id:str(x.id),name:str(x.name),title:str(x.title,"—"),department:str(x.department,str(x.org_id,"—")),skills:Array.isArray(x.skills)?x.skills.filter((s):s is string=>typeof s==="string"):undefined,projects:Array.isArray(x.projects)?x.projects.filter((s):s is string=>typeof s==="string"):undefined,load:measured(x.load),status:str(x.status,"—"),color:avatarColor(str(x.name))}));
}

const loadColor = (v: number) => (v >= 90 ? "#d92d20" : v >= 75 ? "#b87407" : v >= 40 ? "#12855a" : "#12855a");

export default function TeamPage() {
  const query=useData<unknown[]>("people", "/people"),state=recordQueryState(query);
  const [skill, setSkill] = useState("全部");
  if(state.kind!=="ready")return <Shell><PageHeader title="团队" /><QueryNotice state={state} retry={()=>query.refetch()} emptyText="暂无人员" /></Shell>;
  const people=normalize(state.items);
  const shown = people.filter((p) => skill === "全部" || p.skills?.some((s) => s.includes(skill)));

  return (
    <Shell>
      <PageHeader
        title="团队"
        sub={`已加载 ${people.length} 人`}
        right={
          <>
            <SearchBox placeholder="搜索姓名 / 技能" className="w-56" />
            <button className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
              <UserPlus size={14} /> 邀请成员
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[300px_1fr] gap-3 p-6 pt-4">
        {/* 组织架构 */}
        <Card className="self-start p-4">
          <h3 className="text-[13.5px] font-semibold">组织架构</h3>
          <p className="mt-0.5 mb-2 text-[11.5px] text-ink-3">公司 / 二级单位 / 三级单位 / 部门</p>
          <div className="flex items-center gap-2 px-1 py-1.5 text-[12.5px]">
            <Building2 size={14} className="text-ink-3" />
            <span className="flex-1">{ORG_TREE.name}</span>
            <span className="text-[11.5px] text-ink-3">{ORG_TREE.count}</span>
          </div>
          <div className="ml-4 flex flex-col">
            {ORG_TREE.departments.map((d, i) => (
              <div
                key={d.name}
                className={cx(
                  "flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px]",
                  i === 0 ? "bg-accent-soft font-medium" : "text-ink-2 hover:bg-fill",
                )}
              >
                <ChevronRight size={12} className="text-ink-3" />
                <span className="flex-1">{d.name}</span>
                <span className="text-[11.5px] text-ink-3">{d.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 mb-1 px-1 text-[11.5px] text-ink-3">创新工作室</p>
          <div className="ml-4 flex flex-col">
            {ORG_TREE.studios.map((s) => (
              <div key={s.name} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-fill">
                <Users2 size={12} className="text-ink-3" />
                <span className="flex-1">{s.name}</span>
                <span className="text-[11.5px] text-ink-3">{s.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-[11.5px] text-ink-3">1 人可属于多个工作室</p>
        </Card>

        {/* 成员表 */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[12.5px] text-ink-3">技能标签：</span>
            {SKILLS.map((s) => (
              <button
                key={s}
                onClick={() => setSkill(s)}
                className={cx(
                  "h-7 rounded-full px-3 text-[12.5px]",
                  skill === s ? "bg-ink font-medium text-white" : "border border-border bg-panel text-ink-2 hover:bg-fill",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                  <th className="px-5 py-2.5 font-medium">姓名 / 职称</th>
                  <th className="px-3 py-2.5 font-medium">所在项目</th>
                  <th className="px-3 py-2.5 font-medium">技能标签</th>
                  <th className="w-[15%] px-3 py-2.5 font-medium">本周负载</th>
                  <th className="px-5 py-2.5 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-canvas">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={p.name} color={p.color} size={30} />
                        <span>
                          <span className="block text-[13px] font-medium">{p.name}</span>
                          <span className="block text-[11.5px] text-ink-3">{p.title}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.projects ? p.projects.map((x) => (
                          <span key={x} className="rounded-[5px] bg-fill px-1.5 py-0.5 text-[11.5px] text-ink-2">{x}</span>
                        )) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.skills ? p.skills.map((s) => <Badge key={s} color="#16161a">{s}</Badge>) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        {p.load!==undefined ? <><Bar value={p.load} color={loadColor(p.load)} height={5} /><span className="w-9 shrink-0 text-right text-[11.5px] text-ink-3 tabular-nums">{p.load}%</span></> : <span className="text-ink-3">暂不可用</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3"><Badge color={STATUS_COLOR[p.status] || "#86868f"}>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length===0 && <Empty text="没有符合条件的人员" />}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
