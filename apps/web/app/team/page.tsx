"use client";

import React, { useState } from "react";
import { Building2, Layers, Users2, Sparkles, UserPlus, ChevronRight, Building } from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, Avatar, Bar, PageHeader, SearchBox, STATUS_COLOR } from "@/components/ui";
import { PEOPLE, TEAM_PEOPLE, ORG_TREE, Person } from "@/lib/demo";
import { useData } from "@/lib/data";
import { cx, str, num, arr, avatarColor } from "@/lib/utils";

const SKILLS = ["全部", "前端", "后端", "Python", "Go", "报告撰写", "PPT 制作", "需求对接", "运维"];

function TeamSidebar() {
  return (
    <>
      <SideSection title="单位层级">
        <SideItem icon={<Building2 size={14} className="text-accent" />} label="创新中心" count={86} active />
        <SideItem icon={<Layers size={14} />} label="二级单位 · 勘探开发" />
        <SideItem icon={<Building size={14} />} label="公司总部" />
      </SideSection>
      <SideSection title="部门">
        {ORG_TREE.departments.map((d) => (
          <SideItem key={d.name} icon={<Users2 size={14} />} label={d.name} count={d.count} />
        ))}
      </SideSection>
      <SideSection title="创新工作室">
        <SideItem icon={<Sparkles size={14} className="text-purple" />} label="AI 应用工作室" count={9} />
        <SideItem icon={<Users2 size={14} className="text-blue" />} label="数字孪生工作室" count={7} />
      </SideSection>
    </>
  );
}

function normalize(items: unknown[]): Person[] {
  const rows = items
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.name === "string")
    .map((x) => {
      const demo = PEOPLE.find((p) => p.name === x.name);
      return {
        id: str(x.id, demo?.id || str(x.name)),
        name: str(x.name),
        title: str(x.title, demo?.title || "工程师"),
        department: str(x.department, demo?.department || "软件研发部"),
        skills: arr(x.skills).map(String).length ? arr(x.skills).map(String) : demo?.skills || [],
        projects: arr(x.projects).map(String).length ? arr(x.projects).map(String) : demo?.projects || [],
        load: num(x.load, demo?.load ?? 50),
        status: str(x.status, demo?.status || "正常"),
        color: demo?.color || avatarColor(str(x.name)),
      } as Person;
    });
  return rows.length ? rows : TEAM_PEOPLE;
}

const loadColor = (v: number) => (v >= 90 ? "#EE4B43" : v >= 75 ? "#F2970A" : v >= 40 ? "#2FB365" : "#2FB365");

export default function TeamPage() {
  const { data } = useData<unknown[]>("people", "/people", TEAM_PEOPLE);
  const people = normalize(Array.isArray(data) ? data : TEAM_PEOPLE);
  const [skill, setSkill] = useState("全部");
  const shown = people.filter((p) => skill === "全部" || p.skills.some((s) => s.includes(skill)));

  return (
    <Shell sidebar={<TeamSidebar />}>
      <PageHeader
        title="团队"
        extra={
          <>
            <span className="text-[12px] text-ink-3">在编 86</span>
            <span className="text-[12px] text-ink-3">借调 4</span>
            <span className="text-[12px] text-red">负载过高 5</span>
          </>
        }
        right={
          <>
            <SearchBox placeholder="搜索姓名 / 技能" className="w-56" />
            <button className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
              <UserPlus size={14} /> 邀请成员
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[300px_1fr] gap-3 p-7 pt-4">
        {/* 组织架构 */}
        <Card className="self-start p-4">
          <h3 className="text-[13.5px] font-semibold">组织架构</h3>
          <p className="mt-0.5 mb-2 text-[10.5px] text-ink-4">公司 / 二级单位 / 三级单位 / 部门</p>
          <div className="flex items-center gap-2 px-1 py-1.5 text-[12.5px]">
            <Building2 size={14} className="text-ink-3" />
            <span className="flex-1">{ORG_TREE.name}</span>
            <span className="text-[11px] text-ink-4">{ORG_TREE.count}</span>
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
                <ChevronRight size={12} className="text-ink-4" />
                <span className="flex-1">{d.name}</span>
                <span className="text-[11px] text-ink-4">{d.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 mb-1 px-1 text-[10.5px] text-ink-4">创新工作室</p>
          <div className="ml-4 flex flex-col">
            {ORG_TREE.studios.map((s) => (
              <div key={s.name} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-fill">
                <Users2 size={12} className="text-ink-4" />
                <span className="flex-1">{s.name}</span>
                <span className="text-[11px] text-ink-4">{s.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-[10.5px] text-ink-4">1 人可属于多个工作室</p>
        </Card>

        {/* 成员表 */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[12px] text-ink-3">技能标签：</span>
            {SKILLS.map((s) => (
              <button
                key={s}
                onClick={() => setSkill(s)}
                className={cx(
                  "h-7 rounded-full px-3 text-[12px]",
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
                <tr className="border-b border-border text-left text-[11.5px] text-ink-4">
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
                          <span className="block text-[10.5px] text-ink-3">{p.title}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.projects.map((x) => (
                          <span key={x} className="rounded-[5px] bg-fill px-1.5 py-0.5 text-[10.5px] text-ink-2">{x}</span>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.skills.map((s) => <Badge key={s} color="#2F6FED">{s}</Badge>)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <Bar value={p.load} color={loadColor(p.load)} height={5} />
                        <span className="w-9 shrink-0 text-right text-[11.5px] text-ink-3 tabular-nums">{p.load}%</span>
                      </span>
                    </td>
                    <td className="px-5 py-3"><Badge color={STATUS_COLOR[p.status] || "#878C94"}>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
