"use client";

import React from "react";
import Link from "next/link";
import {
  Zap, AlarmClock, GitBranch, Stamp, Activity, Star, Plus, PenLine, Send, Upload,
  AlertTriangle, UserX, FileWarning, CalendarClock, Bell, ChevronRight,
  FileOutput, Languages, BookOpen,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, Avatar, Bar, Marker } from "@/components/ui";
import {
  HOME_STATS, HOME_FOCUS, HOME_TIMELINE, HOME_PULSE, HOME_RISKS, HOME_HEATMAP, WEEK_DAYS, PROJECTS,
} from "@/lib/demo";
import { useData } from "@/lib/data";
import { cx, num } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  zap: Zap, "alarm-clock": AlarmClock, "git-branch": GitBranch, stamp: Stamp, activity: Activity,
  "alert-triangle": AlertTriangle, "user-x": UserX, "file-warning": FileWarning, "calendar-clock": CalendarClock,
};

type HomeApi = { tasks?: number; pending_inbox?: number; conflicts?: number; people?: number };

function HomeSidebar() {
  return (
    <>
      <SideSection title="收藏">
        <SideItem icon={<Star size={14} className="text-orange" fill="currentColor" />} label="智慧油田数据平台" />
        <SideItem icon={<Marker color="#EE4B43" />} label="管道完整性管理" />
        <SideItem icon={<Marker color="#F2970A" shape="square" />} label="北线调度优化" />
      </SideSection>
      <SideSection title="常用入口">
        <SideItem icon={<Plus size={14} className="text-accent" />} label="新建任务" />
        <SideItem icon={<PenLine size={14} className="text-green" />} label="填报阶段成果" />
        <SideItem icon={<Send size={14} className="text-purple" />} label="发起任务派发" />
        <SideItem icon={<Upload size={14} className="text-orange" />} label="上传资料" />
      </SideSection>
      <SideSection title="进行中项目">
        <SideItem icon={<Marker color="#F2970A" />} label="智慧油田数据平台" count={2} countColor="#EE4B43" />
        <SideItem icon={<Marker color="#EE4B43" />} label="管道完整性管理" count={1} countColor="#EE4B43" />
        <SideItem icon={<Marker color="#2FB365" shape="square" />} label="巡检机器人研发" />
        <SideItem icon={<Marker color="#2FB365" shape="triangle" />} label="数字化转型咨询" />
      </SideSection>
    </>
  );
}

function StatCard({ icon, color, label, value, sub, subColor }: { icon: string; color: string; label: string; value: string; sub: string; subColor: string }) {
  const Icon = ICONS[icon] || Zap;
  return (
    <Card className="flex-1 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <Icon size={13} />
        <span style={{ color }} className="text-ink-3">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-tight text-ink">{value}</span>
        <span className="text-[11px]" style={{ color: subColor }}>{sub}</span>
      </div>
    </Card>
  );
}

function MiniTimeline() {
  const W = 100 / 7;
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-[13.5px] font-semibold">本周任务时间线</h3>
        <Badge color="#5F666D">W26</Badge>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-ink-3">
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-green" />已完成</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-blue" />进行中</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red" />逾期</span>
        </div>
      </div>
      <div className="relative">
        <div className="ml-[88px] grid grid-cols-7">
          {WEEK_DAYS.map((d, i) => (
            <div key={d} className={cx("py-1 text-center text-[11px]", i === 2 ? "rounded-[6px] bg-accent-soft font-medium text-accent" : "text-ink-3")}>{d}</div>
          ))}
        </div>
        <div className="relative">
          {/* 今天蓝线 */}
          <div className="absolute top-0 bottom-0 w-px bg-blue" style={{ left: `calc(88px + (100% - 88px) * ${2.5 / 7})` }} />
          {HOME_TIMELINE.map((t) => (
            <div key={t.name} className="flex items-center py-[9px]">
              <span className="w-[88px] shrink-0 truncate pr-3 text-right text-[12px] text-ink-2">{t.name}</span>
              <div className="relative flex-1">
                <div
                  className="flex h-[10px] overflow-hidden rounded-full"
                  style={{ marginLeft: `${(t.start / 7) * 100}%`, width: `${((t.end - t.start) / 7) * 100}%`, background: `${t.color}33` }}
                >
                  <div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: t.color }} />
                </div>
                {t.label && <span className="absolute top-[-1px] ml-2 text-[11px] text-ink-3" style={{ left: `${(t.end / 7) * 100}%` }}>{t.label}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const HEAT_COLOR = { idle: "#F4F4F2", free: "#E7F6EE", full: "#FCF0DB", over: "#FBE9E7" };

export default function HomePage() {
  const { data: apiHome } = useData<HomeApi | null>("home", "/home", null);
  const stats = HOME_STATS.map((s) => ({ ...s }));
  if (apiHome) {
    if (num(apiHome.tasks)) stats[0].value = String(apiHome.tasks);
    if (num(apiHome.conflicts)) stats[2].value = String(apiHome.conflicts);
    if (num(apiHome.pending_inbox)) stats[3].value = String(apiHome.pending_inbox);
  }

  return (
    <Shell sidebar={<HomeSidebar />}>
      {/* 页头 */}
      <div className="flex items-start justify-between px-7 pt-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[19px] font-semibold">早上好，陈思远</h1>
            <Badge color="#2F6FED">部门主任</Badge>
          </div>
          <p className="mt-1 text-[12px] text-ink-3">6月22日 周一 · 创新中心 · 软件研发部 · 3 项风险正在逼近</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-ink-4">⌘K 快速跳转</span>
          <Link href="/dispatch/new" className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
            <Plus size={14} /> 新建任务
          </Link>
          <button className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panel text-ink-2">
            <Bell size={15} />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[9.5px] font-semibold text-white">5</span>
          </button>
          <Avatar name="陈" color="#2F6FED" size={32} />
        </div>
      </div>

      {/* 统计带 */}
      <div className="flex gap-3 px-7 pt-4">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* 第一行三列 */}
      <div className="grid grid-cols-[1.05fr_1.3fr_0.85fr] gap-3 px-7 pt-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">今日焦点</h3>
            <span className="text-[11px] text-ink-4">按行动优先级</span>
          </div>
          <div className="flex flex-col">
            {HOME_FOCUS.map((f) => (
              <button key={f.title} className="flex items-center gap-2.5 border-b border-border/60 py-2.5 text-left last:border-0 hover:bg-canvas">
                <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: f.bar }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge color={f.tagColor}>{f.tag}</Badge>
                    <span className="truncate text-[12.5px] font-medium text-ink">{f.title}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-3">{f.sub}</p>
                </div>
                <ChevronRight size={14} className="shrink-0 text-ink-4" />
              </button>
            ))}
          </div>
        </Card>

        <MiniTimeline />

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">风险雷达</h3>
            <Badge color="#EE4B43">3 高</Badge>
          </div>
          <div className="flex flex-col gap-1">
            {HOME_RISKS.map((r) => {
              const Icon = ICONS[r.icon] || AlertTriangle;
              return (
                <div key={r.title} className="flex items-center gap-2.5 rounded-sm py-2 hover:bg-canvas">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm" style={{ background: `${r.color}1A`, color: r.color }}>
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium">{r.title}</p>
                    <p className="truncate text-[11px] text-ink-3">{r.sub}</p>
                  </div>
                  <span className="text-[15px] font-semibold" style={{ color: r.color }}>{r.count}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 rounded-md bg-accent-soft p-3">
            <p className="text-[11.5px] font-medium text-accent">推荐动作</p>
            <p className="mt-1 text-[11.5px] leading-5 text-ink-2">将张伟的「申报报告撰写」调整至下周，可解除 2 项冲突</p>
            <button className="mt-2 h-7 rounded-sm bg-accent px-2.5 text-[11.5px] font-medium text-white">一键调整排程</button>
          </div>
        </Card>
      </div>

      {/* 第二行三列 */}
      <div className="grid grid-cols-[1.05fr_1.3fr_0.85fr] gap-3 px-7 pt-3 pb-7">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">项目脉搏</h3>
            <span className="text-[11px] text-ink-4">6 个进行中</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {HOME_PULSE.map((p) => (
              <div key={p.name}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="text-ink-2">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <Badge color={p.color}>{p.status}</Badge>
                    <span className="text-ink-3">{p.progress}%</span>
                  </span>
                </div>
                <Bar value={p.progress} color={p.color} height={4} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="row-span-1 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">团队负载 · 未来 7 天</h3>
            <div className="flex items-center gap-2.5 text-[10.5px] text-ink-3">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: HEAT_COLOR.idle }} />空闲</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: HEAT_COLOR.full }} />饱和</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: HEAT_COLOR.over }} />过载</span>
            </div>
          </div>
          <div className="flex flex-col gap-[5px]">
            {HOME_HEATMAP.map((r) => (
              <div key={r.name} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-[11px] text-ink-3">{r.name}</span>
                <div className="grid flex-1 grid-cols-7 gap-[5px]">
                  {r.cells.map((c, i) => (
                    <span key={i} className="h-[13px] rounded-[3px]" style={{ background: HEAT_COLOR[c] }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-[13.5px] font-semibold">快捷工具</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: FileOutput, color: "#EE4B43", label: "PDF 转换" },
              { icon: Languages, color: "#3B82F6", label: "智能翻译" },
              { icon: PenLine, color: "#9B59F5", label: "论文助手" },
              { icon: BookOpen, color: "#2FB365", label: "个人知识库" },
            ].map((t) => (
              <Link key={t.label} href="/tools" className="flex flex-col items-start gap-1.5 rounded-md bg-fill/60 p-3 hover:bg-fill">
                <t.icon size={16} style={{ color: t.color }} />
                <span className="text-[11.5px] text-ink-2">{t.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
