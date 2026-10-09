"use client";

import React from "react";
import { Zap, CalendarDays, CalendarRange, CheckCircle2, Sun, BookOpen, Paperclip, SquarePen } from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, PageHeader, Marker } from "@/components/ui";
import { MY_TASKS, MY_SCHEDULE, MY_DISTRIBUTION, WEEK_DAYS } from "@/lib/demo";
import { useData } from "@/lib/data";
import { cx } from "@/lib/utils";

function MyWorkSidebar() {
  return (
    <>
      <SideSection title="任务分组">
        <SideItem icon={<Zap size={14} className="text-accent" />} label="今天" count={4} active />
        <SideItem icon={<CalendarDays size={14} />} label="本周" count={8} />
        <SideItem icon={<CalendarRange size={14} />} label="下周" count={3} />
        <SideItem icon={<CheckCircle2 size={14} className="text-green" />} label="已完成" count={21} />
      </SideSection>
      <SideSection title="我的项目">
        <SideItem icon={<Marker color="#F2970A" />} label="智慧油田数据平台" count={<span className="rounded bg-fill px-1 text-[10px] text-ink-3">后端</span>} />
        <SideItem icon={<Marker color="#9B59F5" shape="square" />} label="等保测评专项" count={<span className="rounded bg-fill px-1 text-[10px] text-ink-3">材料</span>} />
        <SideItem icon={<Marker color="#2FB365" shape="square" />} label="巡检机器人研发" count={<span className="rounded bg-fill px-1 text-[10px] text-ink-3">用例</span>} />
      </SideSection>
      <SideSection title="其他">
        <SideItem icon={<Sun size={14} />} label="我的休假" />
        <SideItem icon={<BookOpen size={14} />} label="我的学习" />
      </SideSection>
    </>
  );
}

function TaskRow({ t }: { t: (typeof MY_TASKS.thisWeek)[number] }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span
        className={cx(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border",
          t.done ? "border-green bg-green text-white" : "border-ink-4/60 bg-panel",
        )}
      >
        {t.done && <CheckCircle2 size={12} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx("text-[12.5px] font-medium", t.done ? "text-ink-3 line-through" : "text-ink")}>{t.title}</p>
        <p className="mt-0.5 text-[11px]">
          <span className={t.dueRed ? "text-red" : "text-ink-3"}>{t.due}</span>
          <span className="ml-2 text-ink-4">{t.daily}</span>
        </p>
      </div>
      <Badge color={t.tagColor}>{t.tag}</Badge>
    </div>
  );
}

function WeekSchedule() {
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold">我的排程 · 本周</h3>
        <span className="text-[11px] text-ink-3">已排 32h / 40h</span>
      </div>
      <div className="ml-[88px] grid grid-cols-7">
        {WEEK_DAYS.map((d, i) => (
          <div key={d} className={cx("py-1 text-center text-[11px]", i === 2 ? "rounded-[6px] bg-accent-soft font-medium text-accent" : "text-ink-3")}>{d}</div>
        ))}
      </div>
      <div className="relative">
        <div className="absolute top-0 bottom-0 w-px bg-blue" style={{ left: `calc(88px + (100% - 88px) * ${2.5 / 7})` }} />
        {MY_SCHEDULE.map((t) => (
          <div key={t.name} className="flex items-center py-[8px]">
            <span className="w-[88px] shrink-0 truncate pr-3 text-[12px] text-ink-2">{t.name}</span>
            <div className="relative flex-1">
              <div
                className="flex h-[10px] overflow-hidden rounded-full"
                style={{ marginLeft: `${(t.start / 7) * 100}%`, width: `${((t.end - t.start) / 7) * 100}%`, background: `${t.color}33` }}
              >
                <div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: t.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function MyWorkPage() {
  // 真实任务数据（demo 兜底）
  useData("my-tasks", "/tasks", MY_TASKS);
  return (
    <Shell sidebar={<MyWorkSidebar />}>
      <PageHeader
        title={
          <span>
            我的工作
            <span className="ml-3 text-[12px] font-normal text-ink-3">陈思远 · 软件研发部 · 一级工程师 · 参与 3 个项目</span>
          </span>
        }
        right={
          <>
            <button className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">清单</button>
            <button className="h-8 rounded-sm border border-border bg-panel px-3 text-[12.5px] text-ink-2">日历</button>
            <button className="h-8 rounded-sm border border-border bg-panel px-3 text-[12.5px] text-ink-2">统计</button>
            <button className="flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[12.5px] font-medium text-white">
              <SquarePen size={13} /> 填报阶段成果
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[1fr_1.15fr] gap-3 p-7 pt-4">
        {/* 个人任务清单 */}
        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">个人任务清单</h3>
            <span className="text-[11px] text-ink-4">8 项进行中</span>
          </div>
          <p className="py-1 text-[11px] text-ink-4">本周 · 6/22 - 6/28</p>
          {MY_TASKS.thisWeek.map((t) => <TaskRow key={t.id} t={t} />)}
          <p className="py-1 pt-3 text-[11px] text-ink-4">下周 · 6/29 - 7/5</p>
          {MY_TASKS.nextWeek.map((t) => <TaskRow key={t.id} t={t} />)}
        </Card>

        <div className="flex flex-col gap-3">
          <WeekSchedule />
          <div className="grid grid-cols-[1.5fr_1fr] gap-3">
            {/* 阶段成果填报 */}
            <Card className="flex flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[13.5px] font-semibold">阶段成果填报</h3>
                <Badge color="#2FB365">数据中台联调</Badge>
              </div>
              <textarea
                className="min-h-28 w-full flex-1 resize-none rounded-sm border border-border bg-canvas p-3 text-[12.5px] outline-none placeholder:text-ink-4 focus:border-accent"
                defaultValue="本周完成了接口对齐与 3 个核心模块联调，联调用例通过率 86%…"
              />
              <div className="mt-2 flex items-center gap-2">
                <span className="flex h-7 items-center gap-1.5 rounded-sm border border-border px-2 text-[11.5px] text-ink-2">
                  <Paperclip size={12} /> 联调报告.pdf
                </span>
                <span className="flex h-7 items-center gap-1.5 rounded-sm border border-border px-2 text-[11.5px] text-ink-2">
                  <Paperclip size={12} /> 测试数据.xlsx
                </span>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">存草稿</button>
                <button className="h-8 rounded-sm bg-accent px-3 text-[12.5px] font-medium text-white">提交负责人确认</button>
              </div>
            </Card>

            {/* 本周投入分布 */}
            <Card className="p-4">
              <h3 className="text-[13.5px] font-semibold">本周投入分布</h3>
              <p className="mt-2 text-[19px] font-semibold">32h <span className="text-[13px] font-normal text-ink-3">/ 40h</span></p>
              <div className="mt-3 flex flex-col gap-3">
                {MY_DISTRIBUTION.map((d) => (
                  <div key={d.label}>
                    <div className="mb-1 flex items-center justify-between text-[11.5px]">
                      <span className="text-ink-2">{d.label}</span>
                      <span className="text-ink-3">{d.pct}%</span>
                    </div>
                    <div className="h-[5px] overflow-hidden rounded-full bg-fill">
                      <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: d.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}
