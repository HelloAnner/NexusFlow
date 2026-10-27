"use client";

import React, { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CornerUpLeft } from "lucide-react";
import { Shell } from "@/components/shell";
import { Badge, Avatar, Marker, Empty, PageHeader } from "@/components/ui";
import type { GanttGroup,GanttTask } from "@/lib/demo";
import { QueryNotice } from "@/components/query-notice";
import { recordQueryState,queryState } from "@/lib/query-state";
import { projectPlanState } from "@/lib/plan-data";
import { useData } from "@/lib/data";
import { cx, addDays, mdCn, str,dayDiff } from "@/lib/utils";
import { api } from "@/lib/api";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";

const CHART_W = 1500;
const ROW_H = 40;
const GROUP_H = 40;
const LABEL_W = 210;
type Row = { kind: "group"; group: GanttGroup } | { kind: "task"; group: GanttGroup; task: GanttTask };

export default function GanttClient() {
 const id=useSearchParams().get("id");
 if(!id)return <Shell><Empty text="未指定项目" /></Shell>;
 return <PlanQueries id={id} />;
}
function PlanQueries({id}:{id:string}){
 const projects=useData<unknown[]>("projects","/projects");
 const groups=useData<unknown[]>(`plan-${id}`,`/projects/${encodeURIComponent(id)}/tasks`);
 const state=projectPlanState(id,recordQueryState(projects),queryState(groups));
 if(state.kind!=="ready")return <Shell><PageHeader title="项目计划" /><QueryNotice state={state} retry={()=>Promise.all([projects.refetch(),groups.refetch()])} emptyText={state.kind==="empty"?state.message:"暂无项目任务"} /></Shell>;
 return <PlanChart project={state.project} groups={state.groups} start={state.start} days={state.days} onChanged={()=>groups.refetch()} />;
}
function PlanChart({project,groups,start,days,onChanged}:{project:Record<string,unknown>;groups:GanttGroup[];start:string;days:number;onChanged:()=>unknown}){
  const GANTT_START=start,GANTT_TOTAL_DAYS=days,GANTT_TODAY_DAY=dayDiff(start,new Date().toISOString().slice(0,10)),DAY_W=CHART_W/days;
  const [selected, setSelected] = useState<string | null>(null);
  const [scale, setScale] = useState<"周" | "月" | "阶段">("阶段");
  const [editing, setEditing] = useState<{ id: string; name: string; start: string; end: string; hours: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of groups) {
      out.push({ kind: "group", group: g });
      for (const t of g.tasks) out.push({ kind: "task", group: g, task: t });
    }
    return out;
  }, [groups]);

  const rowY = (i: number, kind: Row["kind"]) => rows.slice(0, i).reduce((h, r) => h + (r.kind === "group" ? GROUP_H : ROW_H), 0);
  const totalH = rows.reduce((h, r) => h + (r.kind === "group" ? GROUP_H : ROW_H), 0);
  const ticks = Array.from({ length: Math.floor(GANTT_TOTAL_DAYS / 30) + 1 }, (_, i) => i * 30);
  const selectedTask=rows.find((r):r is Extract<Row,{kind:"task"}>=>r.kind==="task"&&r.task.id===selected);
  const selectedRow=selectedTask?rows.indexOf(selectedTask):-1;

  return (
    <Shell>
      {/* 项目页头 */}
      <div className="flex items-start justify-between px-6 pt-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Marker color="#b87407" size={18} />
            <h1 className="text-[18px] font-semibold">{str(project.name)}</h1>
            <Badge color="#86868f">{str(project.status,"—")}</Badge>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <CornerUpLeft size={12} />
            <span className="font-medium text-ink">{str(project.name)}</span>
          </p>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center justify-between px-6 py-2.5">
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
          <button
            onClick={() => {
              const box = scroller.current;
              if (!box) return;
              const ratio = Math.max(0, Math.min(1, GANTT_TODAY_DAY / GANTT_TOTAL_DAYS));
              box.scrollTo({ left: Math.max(0, ratio * box.scrollWidth - box.clientWidth / 2), behavior: "smooth" });
            }}
            className="h-7 rounded-sm border border-border bg-panel px-2.5 text-[11.5px] text-ink-2"
          >
            回到今天
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-green" />已完成</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ink-4" />进行中</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border border-ink-4" />计划</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border border-red" />逾期</span>
        </div>
      </div>

      {/* 甘特主体 */}
      <div className="px-6 pb-6">
        <div ref={scroller} className="overflow-x-auto rounded-lg border border-border bg-panel">
          {/* 刻度头 */}
          <div className="flex border-b border-border">
            <div className="shrink-0 px-4 py-2 text-[11.5px] text-ink-3" style={{ width: LABEL_W }}>任务 / 工作流</div>
            <div className="relative flex-1">
              {ticks.map((d) => (
                <div key={d} className="absolute top-0 py-1.5" style={{ left: `${(d / GANTT_TOTAL_DAYS) * 100}%` }}>
                  <p className={cx("pl-1 text-[12.5px] font-semibold", d === GANTT_TODAY_DAY ? "text-blue" : "text-ink")}>Day {d}</p>
                  <p className={cx("pl-1 text-[11.5px]", d === GANTT_TODAY_DAY ? "text-blue" : "text-ink-3")}>{mdCn(addDays(GANTT_START, d))}</p>
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
                    <span className="rounded-[6px] px-1.5 py-0.5 text-[11.5px] font-medium text-white" style={{ background: r.group.typeColor }}>
                      {r.group.type}
                    </span>
                    <Avatar name={r.group.owner} color={r.group.ownerColor} size={20} />
                    <span className="text-[12.5px] text-ink-2">{r.group.owner}</span>
                  </div>
                ) : (
                  <button
                    key={i}
                    onClick={() => setSelected(r.task.id === selected ? null : r.task.id)}
                    className={cx(
                      "flex w-full items-center px-4 pl-11 text-left text-[12.5px]",
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
                  <line key={i} x1={0} y1={rowY(i, r.kind)} x2={CHART_W} y2={rowY(i, r.kind)} stroke="#f5f4f2" strokeWidth={1} vectorEffect="non-scaling-stroke" />
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
                  } else if (t.kind === "done") {
                    parts.push(<rect key="b" x={x} y={y} width={w} height={10} rx={5} fill={c} />);
                  } else {
                    // 缺少进度时只画背景，不暗示已完成。
                    const pct = t.progress ?? 0;
                    parts.push(<rect key="bg" x={x} y={y} width={w} height={10} rx={5} fill={c} opacity={0.25} />);
                    parts.push(<rect key="fg" x={x} y={y} width={(w * pct) / 100} height={10} rx={5} fill={c} />);
                  }
                  // 逾期延伸（红色描边段）
                  if (t.overdueTo && t.overdueTo > t.end) {
                    parts.push(
                      <rect key="ov" x={t.end * DAY_W} y={y} width={(t.overdueTo - t.end) * DAY_W} height={10} rx={5} fill="#d92d20" fillOpacity={0.08} stroke="#d92d20" strokeWidth={1.5} />,
                    );
                  }
                  // 行尾说明文字
                  if (t.note) {
                    parts.push(
                      <text key="n" x={Math.min((t.overdueTo || t.end) * DAY_W + 8, CHART_W - 8)} y={y + 9} fontSize={11} fill="#86868f">{t.note}</text>,
                    );
                  }
                  if (t.overdueLabel) {
                    // 红字标签画在逾期延伸条内部右端，避免超出 viewBox 被裁剪
                    parts.push(
                      <text key="o" x={(t.overdueTo || t.end) * DAY_W - 8} y={y + 9} fontSize={11} fill="#d92d20" textAnchor="end">{t.overdueLabel}</text>,
                    );
                  }
                  return (
                    <g key={t.id} className="cursor-pointer" onClick={() => setSelected(t.id === selected ? null : t.id)}>
                      {parts}
                    </g>
                  );
                })}
                {/* 今天蓝线 */}
                <line x1={GANTT_TODAY_DAY * DAY_W} y1={0} x2={GANTT_TODAY_DAY * DAY_W} y2={totalH} stroke="#2563eb" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
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
                  <div className="flex flex-col gap-2 text-[12.5px]">
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
                    <button
                      onClick={() => setEditing({
                        id: selectedTask.task.id,
                        name: selectedTask.task.name,
                        start: addDays(GANTT_START, selectedTask.task.start),
                        end: addDays(GANTT_START, selectedTask.task.overdueTo ?? selectedTask.task.end),
                        hours: "4",
                      })}
                      className="h-7 flex-1 rounded-sm bg-ink text-[11.5px] font-medium text-white"
                    >
                      调整计划
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Modal
        open={!!editing}
        title={`调整计划 · ${editing?.name ?? ""}`}
        onClose={() => setEditing(null)}
        footer={<>
          <button onClick={() => setEditing(null)} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button
            onClick={async () => {
              if (!editing) return;
              setSaving(true);
              try {
                await api(`/tasks/${editing.id}/action`, { method: "POST", body: JSON.stringify({
                  action: "reschedule", start_date: editing.start, end_date: editing.end, daily_hours: Number(editing.hours),
                }) });
                toast("计划已调整");
                setEditing(null);
                setSelected(null);
                await onChanged();
              } catch (e) { toast(errorText(e), "err"); } finally { setSaving(false); }
            }}
            disabled={saving}
            className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始时间">
              <input type="date" className={inputCls} value={editing?.start ?? ""} onChange={(e) => setEditing((v) => v && { ...v, start: e.target.value })} />
            </Field>
            <Field label="截止时间">
              <input type="date" className={inputCls} value={editing?.end ?? ""} onChange={(e) => setEditing((v) => v && { ...v, end: e.target.value })} />
            </Field>
          </div>
          <Field label="每日投入（小时）">
            <input type="number" min={0} max={24} step="0.5" className={inputCls} value={editing?.hours ?? "4"} onChange={(e) => setEditing((v) => v && { ...v, hours: e.target.value })} />
          </Field>
          <p className="text-[11.5px] leading-5 text-ink-3">存在阻塞冲突时接口会拒绝保存，需要先在负载与冲突页处理。</p>
        </div>
      </Modal>
    </Shell>
  );
}
