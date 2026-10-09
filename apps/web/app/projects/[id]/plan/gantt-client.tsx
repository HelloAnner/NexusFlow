"use client";

import React, { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CornerUpLeft, Share2, MoreHorizontal, SlidersHorizontal, Star } from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Badge, Avatar, Marker } from "@/components/ui";
import { PROJECTS, GANTT_GROUPS, GANTT_START, GANTT_TOTAL_DAYS, GANTT_TODAY_DAY, GanttGroup, GanttTask } from "@/lib/demo";
import { useData } from "@/lib/data";
import { cx, addDays, mdCn, str } from "@/lib/utils";

const CHART_W = 1500;
const ROW_H = 40;
const GROUP_H = 40;
const LABEL_W = 210;
const DAY_W = CHART_W / GANTT_TOTAL_DAYS;

function GanttSidebar() {
  return (
    <>
      <SideSection title="收藏">
        <SideItem icon={<Star size={14} className="text-orange" fill="currentColor" />} label="智慧油田数据平台" />
        <SideItem icon={<Marker color="#EE4B43" />} label="管道完整性管理" />
        <SideItem icon={<Marker color="#F2970A" shape="square" />} label="北线调度优化" />
      </SideSection>
      <SideSection title="进行中项目">
        <SideItem icon={<Marker color="#EE4B43" />} label="管道完整性管理" count={1} countColor="#EE4B43" />
        <SideItem icon={<Marker color="#F2970A" />} label="智慧油田数据平台" count={2} countColor="#EE4B43" active bold />
        <div className="ml-6 flex flex-col gap-0.5">
          {["需求调研", "总体设计", "开发实施", "试运行"].map((s) => (
            <SideItem key={s} icon={<Marker color="#AEB4BB" shape="square" size={12} />} label={<span className="text-ink-3">{s}</span>} />
          ))}
        </div>
        <SideItem icon={<Marker color="#2FB365" shape="square" />} label="巡检机器人研发" />
        <SideItem icon={<Marker color="#2FB365" shape="triangle" />} label="数字化转型咨询" />
      </SideSection>
      <SideSection title="待启动">
        <SideItem icon={<Marker color="#AEB4BB" shape="dash" />} label="LNG 接收站智能化" />
        <SideItem icon={<Marker color="#AEB4BB" shape="dash" />} label="管网数字孪生" />
      </SideSection>
      <SideSection title="已完成 · 3" defaultOpen={false}>
        <></>
      </SideSection>
    </>
  );
}

type Row = { kind: "group"; group: GanttGroup } | { kind: "task"; group: GanttGroup; task: GanttTask };

function barOpacity(kind: GanttTask["kind"]) {
  return kind === "done" ? 1 : 1;
}

export default function GanttClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "p1";
  const { data: projects } = useData("projects", "/projects", PROJECTS);
  const project = (projects as typeof PROJECTS).find((p) => p.id === id) || PROJECTS[0];
  const { data: groups } = useData<GanttGroup[]>(`plan-${id}`, `/projects/${id}/tasks`, GANTT_GROUPS);
  const safeGroups = Array.isArray(groups) && groups.length && (groups[0] as GanttGroup).tasks ? groups : GANTT_GROUPS;

  const [selected, setSelected] = useState<string | null>("t5"); // 设计稿默认选中「数据中台迁移」
  const [scale, setScale] = useState<"周" | "月" | "阶段">("阶段");

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of safeGroups) {
      out.push({ kind: "group", group: g });
      for (const t of g.tasks) out.push({ kind: "task", group: g, task: t });
    }
    return out;
  }, [safeGroups]);

  const rowY = (i: number, kind: Row["kind"]) => rows.slice(0, i).reduce((h, r) => h + (r.kind === "group" ? GROUP_H : ROW_H), 0);
  const totalH = rows.reduce((h, r) => h + (r.kind === "group" ? GROUP_H : ROW_H), 0);
  const ticks = Array.from({ length: GANTT_TOTAL_DAYS / 30 + 1 }, (_, i) => i * 30);
  const selectedRow = rows.findIndex((r) => r.kind === "task" && r.task.id === selected);
  const selectedTask = selectedRow >= 0 ? (rows[selectedRow] as Extract<Row, { kind: "task" }>) : null;

  return (
    <Shell sidebar={<GanttSidebar />}>
      {/* 项目页头 */}
      <div className="flex items-start justify-between px-7 pt-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Marker color="#F2970A" size={18} />
            <h1 className="text-[17px] font-semibold">{str(project.name, "智慧油田数据平台")}</h1>
            <Badge color="#F2970A">存在风险</Badge>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-3">
            <CornerUpLeft size={12} />
            创新中心 / 软件研发部 / 公司级科研 / <span className="font-medium text-ink">{str(project.name, "智慧油田数据平台")}</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex -space-x-1.5">
            {[["张", "#2FB365"], ["李", "#9B59F5"], ["王", "#F2970A"], ["陈", "#3B82F6"]].map(([n, c]) => (
              <Avatar key={n} name={n} color={c} size={26} className="border-2 border-panel" />
            ))}
          </span>
          <button className="flex h-8 items-center gap-1.5 rounded-sm border border-border bg-panel px-3 text-[12.5px] text-ink-2">
            <Share2 size={13} /> 分享
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-panel text-ink-2">
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      {/* 页签 */}
      <div className="flex items-center gap-5 border-b border-border px-7 text-[12.5px]">
        {[
          ["概览", ""], ["计划", ""], ["成员", ""], ["问题", "7"], ["资料", "12"], ["动态", "3"],
        ].map(([t, c]) => (
          <button
            key={t}
            className={cx(
              "flex items-center gap-1 border-b-2 py-2.5",
              t === "计划" ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {t}
            {c && <span className={cx("text-[11px]", t === "动态" ? "text-red" : "text-ink-4")}>{c}</span>}
          </button>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center justify-between px-7 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex rounded-sm bg-fill p-0.5">
            {(["周", "月", "阶段"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={cx("h-6 rounded-[6px] px-2.5 text-[11.5px]", scale === s ? "bg-panel font-medium text-ink shadow-sm" : "text-ink-3")}
              >
                {s}
              </button>
            ))}
          </div>
          <button className="h-7 rounded-sm border border-border bg-panel px-2.5 text-[11.5px] text-ink-2">回到今天</button>
          <button className="flex h-7 items-center gap-1 rounded-sm border border-border bg-panel px-2.5 text-[11.5px] text-ink-2">
            <SlidersHorizontal size={12} /> 筛选
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-green" />已完成</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ink-4" />进行中</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border border-ink-4" />计划</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border border-red" />逾期</span>
        </div>
      </div>

      {/* 甘特主体 */}
      <div className="px-7 pb-7">
        <div className="overflow-hidden rounded-lg border border-border bg-panel">
          {/* 刻度头 */}
          <div className="flex border-b border-border">
            <div className="shrink-0 px-4 py-2 text-[11.5px] text-ink-4" style={{ width: LABEL_W }}>任务 / 工作流</div>
            <div className="relative flex-1">
              {ticks.map((d) => (
                <div key={d} className="absolute top-0 py-1.5" style={{ left: `${(d / GANTT_TOTAL_DAYS) * 100}%` }}>
                  <p className={cx("pl-1 text-[12px] font-semibold", d === GANTT_TODAY_DAY ? "text-blue" : "text-ink")}>Day {d}</p>
                  <p className={cx("pl-1 text-[10.5px]", d === GANTT_TODAY_DAY ? "text-blue" : "text-ink-4")}>{mdCn(addDays(GANTT_START, d))}</p>
                </div>
              ))}
              <div className="h-[46px]" />
            </div>
          </div>

          {/* 行 + SVG 图表 */}
          <div className="flex">
            {/* 左标签列 */}
            <div className="shrink-0 border-r border-border" style={{ width: LABEL_W }}>
              {rows.map((r, i) =>
                r.kind === "group" ? (
                  <div key={i} className="flex items-center gap-2 px-4" style={{ height: GROUP_H }}>
                    <span className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: r.group.typeColor }}>
                      {r.group.type}
                    </span>
                    <Avatar name={r.group.owner} color={r.group.ownerColor} size={20} />
                    <span className="text-[12px] text-ink-2">{r.group.owner}</span>
                  </div>
                ) : (
                  <button
                    key={i}
                    onClick={() => setSelected(r.task.id === selected ? null : r.task.id)}
                    className={cx(
                      "flex w-full items-center px-4 pl-11 text-left text-[12px]",
                      selected === r.task.id ? "bg-accent-soft font-semibold text-ink" : "text-ink-2 hover:bg-fill",
                    )}
                    style={{ height: ROW_H }}
                  >
                    {r.task.name}
                  </button>
                ),
              )}
            </div>

            {/* SVG 图区 */}
            <div className="relative min-w-0 flex-1">
              {/* 行选中高亮条 */}
              {selectedRow >= 0 && (
                <div
                  className="absolute right-0 left-0 bg-accent-soft/60"
                  style={{ top: rowY(selectedRow, "task"), height: ROW_H }}
                />
              )}
              <svg
                viewBox={`0 0 ${CHART_W} ${totalH}`}
                preserveAspectRatio="none"
                className="block h-auto w-full"
                style={{ height: totalH }}
              >
                {/* 竖向网格线 */}
                {ticks.map((d) => (
                  <line key={d} x1={d * DAY_W} y1={0} x2={d * DAY_W} y2={totalH} stroke={d === GANTT_TODAY_DAY ? "#C7DBFB" : "#F1F1EF"} strokeWidth={d === GANTT_TODAY_DAY ? 1.2 : 1} vectorEffect="non-scaling-stroke" />
                ))}
                {/* 行分隔线 */}
                {rows.map((r, i) => (
                  <line key={i} x1={0} y1={rowY(i, r.kind)} x2={CHART_W} y2={rowY(i, r.kind)} stroke="#F4F4F2" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                ))}
                {/* 任务条 */}
                {rows.map((r, i) => {
                  if (r.kind !== "task") return null;
                  const t = r.task;
                  const y = rowY(i, "task") + ROW_H / 2 - 5;
                  const x = t.start * DAY_W;
                  const w = Math.max(6, (t.end - t.start) * DAY_W);
                  const c = r.group.typeColor;
                  const parts: React.ReactNode[] = [];
                  if (t.kind === "plan") {
                    parts.push(<rect key="b" x={x} y={y} width={w} height={10} rx={5} fill="none" stroke={c} strokeWidth={1.5} />);
                  } else if (t.kind === "done" || t.kind === "prog") {
                    parts.push(<rect key="b" x={x} y={y} width={w} height={10} rx={5} fill={c} opacity={barOpacity(t.kind)} />);
                  } else {
                    // mixed：实色进度 + 浅色剩余
                    parts.push(<rect key="bg" x={x} y={y} width={w} height={10} rx={5} fill={c} opacity={0.25} />);
                    parts.push(<rect key="fg" x={x} y={y} width={Math.max(6, (w * (t.progress || 0)) / 100)} height={10} rx={5} fill={c} />);
                  }
                  // 逾期延伸（红色描边段）
                  if (t.overdueTo && t.overdueTo > t.end) {
                    parts.push(
                      <rect key="ov" x={t.end * DAY_W} y={y} width={(t.overdueTo - t.end) * DAY_W} height={10} rx={5} fill="#EE4B43" fillOpacity={0.08} stroke="#EE4B43" strokeWidth={1.5} />,
                    );
                  }
                  // 行尾说明文字
                  if (t.note) {
                    parts.push(
                      <text key="n" x={(t.overdueTo || t.end) * DAY_W + 8} y={y + 9} fontSize={11} fill="#878C94">{t.note}</text>,
                    );
                  }
                  if (t.overdueLabel) {
                    parts.push(
                      <text key="o" x={(t.overdueTo || t.end) * DAY_W + 8} y={y + 9} fontSize={11} fill="#EE4B43">{t.overdueLabel}</text>,
                    );
                  }
                  return (
                    <g key={t.id} className="cursor-pointer" onClick={() => setSelected(t.id === selected ? null : t.id)}>
                      {parts}
                    </g>
                  );
                })}
                {/* 今天蓝线 */}
                <line x1={GANTT_TODAY_DAY * DAY_W} y1={0} x2={GANTT_TODAY_DAY * DAY_W} y2={totalH} stroke="#3B82F6" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              </svg>

              {/* 任务弹层 */}
              {selectedTask?.task.popover && (
                <div
                  className="absolute z-10 w-64 rounded-lg border border-border bg-panel p-4 shadow-lg"
                  style={{
                    left: `min(${(((selectedTask.task.overdueTo || selectedTask.task.end) / GANTT_TOTAL_DAYS) * 100).toFixed(1)}%, 55%)`,
                    top: Math.max(8, rowY(selectedRow, "task") - 40),
                  }}
                >
                  <h4 className="mb-2.5 text-[13.5px] font-semibold">{selectedTask.task.name}</h4>
                  <div className="flex flex-col gap-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">负责人</span>
                      <span className="flex items-center gap-1.5">
                        <Avatar name={selectedTask.task.popover.owner} color={selectedTask.task.popover.ownerColor} size={18} />
                        {selectedTask.task.popover.owner}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">计划周期</span>
                      <span className="font-medium">{selectedTask.task.popover.plan}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">预测交付</span>
                      <span className="font-medium text-red">{selectedTask.task.popover.forecast}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">阻塞于</span>
                      <span className="font-medium">{selectedTask.task.popover.blockedBy}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="h-7 flex-1 rounded-sm bg-accent text-[11.5px] font-medium text-white">
                      打开 {selectedTask.task.popover.code}
                    </button>
                    <button className="h-7 flex-1 rounded-sm border border-border text-[11.5px] text-ink-2">调整计划</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
