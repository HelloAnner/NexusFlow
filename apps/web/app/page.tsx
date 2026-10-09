"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Zap, AlarmClock, GitBranch, Stamp, Activity, Plus, PenLine, Send, Upload, Wrench,
  AlertTriangle, UserX, FileWarning, CalendarClock, Bell, ChevronRight, RefreshCw,
  FileOutput, Languages, BookOpen, MessageCircle, NotebookPen, CalendarCheck, BarChart3, LogOut,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, Avatar, Bar, Marker, Empty } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cx, md, num, str } from "@/lib/utils";
import {
  HEAT_COLOR, avgTeamRatio, dateLabel, dayLabel, focusRows, greetingAt, heatLevel, overloadedPeople,
  projectStatusColor, projectStatusText, riskGroups, roleLabel, itemRows, timelineBars,
  todayDueCount, todayISO, overdueCount, TOOL_COLOR, TOOL_ICON,
  type HomeResponse, type ProjectRow, type ToolRow, type TeamLoadPerson,
} from "@/lib/home";

type IconC = React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;

const ICONS: Record<string, IconC> = {
  zap: Zap, "alarm-clock": AlarmClock, "git-branch": GitBranch, stamp: Stamp, activity: Activity,
  "alert-triangle": AlertTriangle, "user-x": UserX, "file-warning": FileWarning, "calendar-clock": CalendarClock,
  "file-output": FileOutput, languages: Languages, "pen-line": PenLine, "book-open": BookOpen,
  "message-circle": MessageCircle, "notebook-pen": NotebookPen, "calendar-check": CalendarCheck,
  "bar-chart-3": BarChart3, wrench: Wrench,
};

// ---------- 通用状态 ----------
const SkLine = ({ w = "100%", h = 12 }: { w?: string; h?: number }) => (
  <div className="animate-pulse rounded-[3px] bg-fill" style={{ width: w, height: h }} />
);

function SkRows({ n = 4 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <div className="h-8 w-[3px] animate-pulse rounded-full bg-fill" />
          <div className="flex flex-1 flex-col gap-1.5"><SkLine w="62%" /><SkLine w="38%" h={8} /></div>
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-[12px] text-ink-4">
      <span className="flex items-center gap-1.5 text-red"><AlertTriangle size={13} />暂不可用</span>
      <button
        onClick={onRetry}
        className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-panel px-2.5 text-[12px] text-ink-2 hover:bg-fill"
      >
        <RefreshCw size={12} />重试
      </button>
    </div>
  );
}

function Module({
  pending, error, onRetry, empty = false, emptyText = "暂无数据", skeleton, children,
}: {
  pending: boolean; error: boolean; onRetry: () => void; empty?: boolean;
  emptyText?: string; skeleton: React.ReactNode; children: React.ReactNode;
}) {
  if (pending) return <>{skeleton}</>;
  if (error) return <ErrorBox onRetry={onRetry} />;
  if (empty) return <Empty text={emptyText} />;
  return <>{children}</>;
}

function StatCard({ icon, color, label, value, sub, subColor }: { icon: string; color: string; label: string; value: string; sub: string; subColor: string }) {
  const Icon = ICONS[icon] || Zap;
  return (
    <Card className="flex-1 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <Icon size={13} style={{ color }} />
        <span className="text-ink-3">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-tight text-ink tabular-nums">{value}</span>
        {sub && <span className="text-[11px]" style={{ color: subColor }}>{sub}</span>}
      </div>
    </Card>
  );
}

// ---------- 侧边栏（真实数据） ----------
function HomeSidebar({ projects, pending, error }: { projects: ProjectRow[]; pending: boolean; error: boolean }) {
  const router = useRouter();
  const active = projects.filter((p) => str(p.status, "") === "active").slice(0, 4);
  return (
    <>
      <SideSection title="常用入口">
        <SideItem icon={<Plus size={14} className="text-accent" />} label="新建任务" onClick={() => router.push("/dispatch/new")} />
        <SideItem icon={<Send size={14} className="text-purple" />} label="发起任务派发" onClick={() => router.push("/dispatch/new")} />
        <SideItem icon={<PenLine size={14} className="text-green" />} label="我的工作" onClick={() => router.push("/my-work")} />
        <SideItem icon={<Upload size={14} className="text-orange" />} label="上传资料" onClick={() => router.push("/files")} />
        <SideItem icon={<Wrench size={14} />} label="工具台" onClick={() => router.push("/tools")} />
      </SideSection>
      <SideSection title="进行中项目">
        {pending && <SideItem icon={<Marker color="#AEB4BB" />} label="加载中…" />}
        {!pending && error && <SideItem icon={<Marker color="#EE4B43" />} label="暂不可用" />}
        {!pending && !error && (active.length
          ? active.map((p) => (
            <SideItem
              key={str(p.id, str(p.name))}
              icon={<Marker color={projectStatusColor(p.status)} />}
              label={str(p.name, "未命名项目")}
              onClick={() => router.push(`/projects/${p.id}/plan`)}
            />
          ))
          : <SideItem icon={<Marker color="#AEB4BB" />} label="暂无进行中项目" />)}
      </SideSection>
    </>
  );
}

// ---------- 页面 ----------
export default function HomePage() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [now, setNow] = useState<Date | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => { setNow(new Date()); }, []);

  const homeQ = useQuery({ queryKey: ["home"], queryFn: () => api<HomeResponse>("/home"), staleTime: 30_000, retry: 1 });
  const projectsQ = useQuery({ queryKey: ["home-projects"], queryFn: () => api<{ items?: ProjectRow[] }>("/projects"), staleTime: 30_000, retry: 1 });
  const toolsQ = useQuery({ queryKey: ["home-tools"], queryFn: () => api<{ items?: ToolRow[] }>("/tools"), staleTime: 60_000, retry: 1 });

  const home = homeQ.data;
  // 「今天」锚到服务端聚合口径（team_load_7d.dates[0] 由后端按 UTC 生成），避免本地时区导致今天线偏移。
  const today = home?.team_load_7d?.dates?.[0] ?? (now ? todayISO(now) : "");
  const stats = home?.stats;
  const focus = home?.today_focus ?? [];
  const risks = home?.risk_radar ?? [];
  const tl = home?.timeline ?? [];
  const dates = home?.team_load_7d?.dates ?? [];
  const people7: TeamLoadPerson[] = home?.team_load_7d?.people ?? [];
  const homeReady = !!home && !!now;

  const focusList = homeReady ? focusRows(focus, risks, today).slice(0, 6) : [];
  const groups = riskGroups(risks).slice(0, 4);
  const blocking = risks.filter((r) => str(r.severity, "") === "blocking").length;
  const overPeople = overloadedPeople(people7);
  const avgRatio = avgTeamRatio(people7);
  const bars = homeReady ? timelineBars(tl, dates, today, new Set(risks.map((r) => str(r.task_id, "")).filter(Boolean))).slice(0, 6) : [];
  const todayIdx = dates.indexOf(today);
  const projects = itemRows<ProjectRow>(projectsQ.data).slice(0, 4);
  const tools = itemRows<ToolRow>(toolsQ.data).slice(0, 4);
  const activeProjects = itemRows<ProjectRow>(projectsQ.data).filter((p) => str(p.status, "") === "active").length;

  const statCards = homeReady
    ? [
      { icon: "zap", color: "#2F6FED", label: "今日待办", value: String(num(stats?.today_due)), sub: `${focus.length} 项在办`, subColor: "#2F6FED" },
      { icon: "alarm-clock", color: "#EE4B43", label: "今日截止", value: String(todayDueCount(focus, today)), sub: `${overdueCount(focus, today)} 项已逾期`, subColor: "#EE4B43" },
      { icon: "git-branch", color: "#F2970A", label: "本周冲突", value: String(num(stats?.open_conflicts)), sub: risks.length ? "需协调" : "无冲突", subColor: "#F2970A" },
      { icon: "stamp", color: "#9B59F5", label: "待我审批", value: String(num(stats?.pending_approvals)), sub: num(stats?.pending_approvals) ? "项待处理" : "已清空", subColor: "#9B59F5" },
      { icon: "activity", color: "#2FB365", label: "团队负载", value: avgRatio == null ? "—" : `${avgRatio}%`, sub: `${overPeople} 人过载`, subColor: "#2FB365" },
    ]
    : [
      { icon: "zap", color: "#2F6FED", label: "今日待办", value: "—", sub: "", subColor: "" },
      { icon: "alarm-clock", color: "#EE4B43", label: "今日截止", value: "—", sub: "", subColor: "" },
      { icon: "git-branch", color: "#F2970A", label: "本周冲突", value: "—", sub: "", subColor: "" },
      { icon: "stamp", color: "#9B59F5", label: "待我审批", value: "—", sub: "", subColor: "" },
      { icon: "activity", color: "#2FB365", label: "团队负载", value: "—", sub: "", subColor: "" },
    ];

  const hints = [
    { n: num(stats?.open_conflicts), unit: "项冲突待协调", href: "/load" },
    { n: num(stats?.pending_approvals), unit: "项审批待处理", href: "/inbox" },
    { n: overPeople, unit: "人负载过载", href: "/load" },
  ];

  const advice = groups.some((g) => g.type === "all_day_overlap")
    ? "优先处理全天任务冲突，解除成员排期锁定"
    : groups.some((g) => g.type === "workload_overload")
      ? "调整过载成员排期，降低未来 7 天日均投入"
      : groups.some((g) => g.type === "cross_department_approval")
        ? "跨部门派发需审批，尽快在收件箱处理"
        : "当前无阻塞风险，建议复核未来 7 天负载";

  const retryAll = () => { homeQ.refetch(); projectsQ.refetch(); toolsQ.refetch(); };

  return (
    <Shell sidebar={<HomeSidebar projects={itemRows<ProjectRow>(projectsQ.data)} pending={projectsQ.isPending} error={projectsQ.isError} />}>
      {/* 页头 */}
      <div className="flex items-start justify-between px-7 pt-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[19px] font-semibold">
              {now ? `${greetingAt(now)}，${str(user?.name, "")}` : "你好"}
            </h1>
            <Badge color="#2F6FED">{roleLabel(user?.role)}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
            <span>{now ? dateLabel(now) : "—"}</span>
            {homeReady ? (
              <>
                <span className="text-ink-4">·</span>
                {hints.map((h) => (
                  <Link key={h.unit} href={h.href} className="hover:text-ink-2">
                    <b className={cx("font-semibold", h.n > 0 ? "text-red" : "text-ink-2")}>{h.n}</b> {h.unit}
                  </Link>
                ))}
              </>
            ) : <span className="text-ink-4">· {homeQ.isError ? "风险数据不可用" : "风险数据加载中…"}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dispatch/new" className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-white">
            <Plus size={14} /> 新建任务
          </Link>
          <Link href="/inbox" className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panel text-ink-2">
            <Bell size={15} />
            {homeReady && num(stats?.pending_approvals) > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[9.5px] font-semibold text-white">
                {num(stats?.pending_approvals)}
              </span>
            )}
          </Link>
          <div className="relative">
            {menu && <button aria-label="关闭菜单" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />}
            <button onClick={() => setMenu((m) => !m)} className="relative z-20 block rounded-full">
              <Avatar name={str(user?.name, "?")} color="#2F6FED" size={32} />
            </button>
            {menu && (
              <div className="absolute top-10 right-0 z-20 w-[176px] rounded-lg border border-border bg-panel py-1 shadow-sm">
                <div className="truncate px-3 py-2 text-[11.5px] text-ink-3">
                  {str(user?.username, "—")} · {roleLabel(user?.role)}
                </div>
                <div className="h-px bg-border" />
                <Link href="/my-work" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink-2 hover:bg-fill">
                  <PenLine size={13} /> 我的工作
                </Link>
                <button
                  onClick={() => { setMenu(false); void logout(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink-2 hover:bg-fill"
                >
                  <LogOut size={13} /> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 统计带 */}
      <div className="flex gap-3 px-7 pt-4">
        {homeQ.isError
          ? <Card className="flex-1 px-4 py-4 text-center text-[12px] text-ink-4">
              <button onClick={() => homeQ.refetch()} className="flex w-full items-center justify-center gap-1.5 text-red">
                <AlertTriangle size={13} />首页数据不可用 · 点击重试
              </button>
            </Card>
          : statCards.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* 第一行三列 */}
      <div className="grid grid-cols-[1.05fr_1.3fr_0.85fr] gap-3 px-7 pt-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">今日焦点</h3>
            <span className="text-[11px] text-ink-4">按行动优先级</span>
          </div>
          <Module
            pending={homeQ.isPending || !now} error={homeQ.isError} onRetry={retryAll}
            empty={!focusList.length} emptyText="今天暂无必须处理事项" skeleton={<SkRows n={5} />}
          >
            <div className="flex flex-col">
              {focusList.map((f) => (
                <Link key={f.id} href={f.route} className="flex items-center gap-2.5 border-b border-border/60 py-2.5 text-left last:border-0 hover:bg-canvas">
                  <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: f.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge color={f.color}>{f.tag}</Badge>
                      <span className="truncate text-[12.5px] font-medium text-ink">{f.title}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-ink-3">{f.sub}</p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-ink-4" />
                </Link>
              ))}
            </div>
          </Module>
        </Card>

        {/* 本周时间线 */}
        <Card className="flex flex-col p-4">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-[13.5px] font-semibold">本周任务时间线</h3>
            {dates.length > 0 && <Badge color="#5F666D">{md(dates[0])} - {md(dates[dates.length - 1])}</Badge>}
            <div className="ml-auto flex items-center gap-3 text-[11px] text-ink-3">
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-green" />已完成</span>
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-blue" />进行中</span>
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red" />冲突/逾期</span>
            </div>
          </div>
          <Module
            pending={homeQ.isPending || !now} error={homeQ.isError} onRetry={retryAll}
            empty={!bars.length} emptyText="未来 7 天暂无任务" skeleton={<SkRows n={5} />}
          >
            <div className="relative">
              <div className="flex">
                <span className="w-[88px] shrink-0" />
                <div className="grid flex-1 grid-cols-7">
                  {dates.map((d, i) => (
                    <div key={d} className={cx("py-1 text-center text-[11px]", i === todayIdx ? "rounded-[6px] bg-accent-soft font-medium text-accent" : "text-ink-3")}>
                      {dayLabel(d)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                {todayIdx >= 0 && (
                  <div className="absolute top-0 bottom-0 w-px bg-blue" style={{ left: `calc(88px + (100% - 88px) * ${todayIdx / Math.max(dates.length, 1)})` }} />
                )}
                {bars.map((b) => (
                  <div key={b.id} className="flex items-center py-[9px]">
                    <span className="w-[88px] shrink-0 truncate pr-3 text-right text-[12px] text-ink-2">{b.name}</span>
                    <div className="flex-1">
                      <div
                        className="group relative"
                        style={{ marginLeft: `${(b.offset / Math.max(dates.length, 1)) * 100}%`, width: `${(b.width / Math.max(dates.length, 1)) * 100}%` }}
                      >
                        <div className="flex h-[10px] overflow-hidden rounded-full" style={{ background: `${b.color}33` }}>
                          <div className="h-full rounded-full" style={{ width: `${b.progress}%`, background: b.color }} />
                        </div>
                        <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden rounded-md border border-border bg-panel px-2.5 py-1.5 text-[11px] leading-4 whitespace-nowrap text-ink-2 shadow-sm group-hover:block">
                          <b className="text-ink">{b.tip.name}</b><br />{b.tip.range}<br />{b.tip.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Module>
        </Card>

        {/* 风险雷达 */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">风险雷达</h3>
            {homeReady && (blocking > 0 ? <Badge color="#EE4B43">{blocking} 高</Badge> : <Badge color="#2FB365">正常</Badge>)}
          </div>
          <Module
            pending={homeQ.isPending || !now} error={homeQ.isError} onRetry={retryAll}
            empty={!groups.length} emptyText="未检测到风险" skeleton={<SkRows n={4} />}
          >
            <div className="flex flex-col gap-1">
              {groups.map((g) => {
                const Icon = ICONS[g.icon] || AlertTriangle;
                const parts: string[] = [];
                if (g.people) parts.push(`${g.people} 人`);
                if (g.days) parts.push(`${g.days} 天`);
                if (g.blocking) parts.push(`${g.blocking} 项阻塞`);
                return (
                  <Link key={g.type} href={g.route} className="flex items-center gap-2.5 rounded-sm py-2 hover:bg-canvas">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm" style={{ background: `${g.color}1A`, color: g.color }}>
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{g.label}</p>
                      <p className="truncate text-[11px] text-ink-3">{parts.join(" · ") || "待协调"}</p>
                    </div>
                    <span className="text-[15px] font-semibold tabular-nums" style={{ color: g.color }}>{g.count}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-2 rounded-md bg-accent-soft p-3">
              <p className="text-[11.5px] font-medium text-accent">推荐动作</p>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-2">{advice}</p>
              <Link href="/load" className="mt-2 inline-flex h-7 items-center rounded-sm bg-accent px-2.5 text-[11.5px] font-medium text-white">
                去负载与冲突
              </Link>
            </div>
          </Module>
        </Card>
      </div>

      {/* 第二行三列 */}
      <div className="grid grid-cols-[1.05fr_1.3fr_0.85fr] gap-3 px-7 pt-3 pb-7">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">项目脉搏</h3>
            {!projectsQ.isPending && !projectsQ.isError && <span className="text-[11px] text-ink-4">{activeProjects} 个进行中</span>}
          </div>
          <Module
            pending={projectsQ.isPending} error={projectsQ.isError} onRetry={() => projectsQ.refetch()}
            empty={!projects.length} emptyText="参与项目后会在这里出现" skeleton={<SkRows n={4} />}
          >
            <div className="flex flex-col gap-3.5">
              {projects.map((p) => (
                <Link key={str(p.id, str(p.name))} href={`/projects/${p.id}/plan`} className="block hover:opacity-90">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate text-ink-2">{str(p.name, "未命名项目")}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.level ? <Badge color="#878C94">{p.level}</Badge> : null}
                      <Badge color={projectStatusColor(p.status)}>{projectStatusText(p.status)}</Badge>
                      <span className="w-8 text-right text-ink-3 tabular-nums">{num(p.progress)}%</span>
                    </span>
                  </div>
                  <Bar value={num(p.progress)} color={projectStatusColor(p.status)} height={4} />
                </Link>
              ))}
            </div>
          </Module>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">团队负载 · 未来 7 天</h3>
            <div className="flex items-center gap-2.5 text-[10.5px] text-ink-3">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: HEAT_COLOR.idle }} />空闲</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: HEAT_COLOR.free }} />正常</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: HEAT_COLOR.full }} />饱和</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[3px]" style={{ background: HEAT_COLOR.over }} />过载</span>
            </div>
          </div>
          <Module
            pending={homeQ.isPending || !now} error={homeQ.isError} onRetry={retryAll}
            empty={!people7.length} emptyText="暂无负载数据" skeleton={<SkRows n={5} />}
          >
            <div className="flex flex-col gap-[5px]">
              {people7.slice(0, 8).map((p) => (
                <Link key={str(p.person_id, str(p.name))} href="/load" className="flex items-center gap-2">
                  <span className="w-9 shrink-0 truncate text-[11px] text-ink-3">{str(p.name, "—")}</span>
                  <div className="grid flex-1 grid-cols-7 gap-[5px]">
                    {Array.from({ length: 7 }, (_, i) => {
                      const c = (p.daily ?? [])[i];
                      if (!c) return <span key={i} className="h-[13px] rounded-[3px] bg-fill" />;
                      return (
                        <span
                          key={str(c.date, String(i))}
                          title={`${str(p.name, "—")} ${str(c.date, "")} ${num(c.hours)}h / ${num(c.capacity)}h · ${num(c.ratio)}%`}
                          className="h-[13px] rounded-[3px]"
                          style={{ background: HEAT_COLOR[heatLevel(num(c.ratio, NaN))] }}
                        />
                      );
                    })}
                  </div>
                </Link>
              ))}
            </div>
          </Module>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold">快捷工具</h3>
            <Link href="/tools" className="text-[11px] text-ink-4 hover:text-ink-2">全部</Link>
          </div>
          <Module
            pending={toolsQ.isPending} error={toolsQ.isError} onRetry={() => toolsQ.refetch()}
            empty={!tools.length} emptyText="暂无可用工具" skeleton={<SkRows n={4} />}
          >
            <div className="grid grid-cols-2 gap-2">
              {tools.map((t) => {
                const Icon = ICONS[TOOL_ICON[str(t.id, "")] ?? ""] || Wrench;
                const color = TOOL_COLOR[str(t.id, "")] || "#5F666D";
                return (
                  <Link key={str(t.id, str(t.name))} href="/tools" title={str(t.description)} className="flex flex-col items-start gap-1.5 rounded-md bg-fill/60 p-3 hover:bg-fill">
                    <Icon size={16} style={{ color }} />
                    <span className="text-[11.5px] text-ink-2">{str(t.name, "工具")}</span>
                  </Link>
                );
              })}
            </div>
          </Module>
        </Card>
      </div>
    </Shell>
  );
}
