"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, FlaskConical, Briefcase, PenLine, Flag, BookOpen, Sun, Send, History, RotateCcw, FileText, X, Check, AlertTriangle, Calendar,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { SideSection, SideItem, Card, Badge, Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import { cx } from "@/lib/utils";

const TYPES = ["科研·公司级", "科研·处级", "科研·中心级", "市场", "出差", "文职", "党建", "学习", "休假"];

function DispatchSidebar() {
  return (
    <>
      <SideSection title="任务类型">
        <SideItem icon={<FlaskConical size={14} className="text-accent" />} label="科研" active />
        <SideItem icon={<Briefcase size={14} className="text-purple" />} label="市场" />
        <SideItem icon={<Send size={14} className="text-orange" />} label="出差" />
        <SideItem icon={<PenLine size={14} className="text-blue" />} label="文职" />
        <SideItem icon={<Flag size={14} className="text-pink" />} label="党建" />
        <SideItem icon={<BookOpen size={14} />} label="学习" />
        <SideItem icon={<Sun size={14} />} label="休假" />
      </SideSection>
      <SideSection title="流程">
        <SideItem icon={<Send size={14} className="text-accent" />} label="标准流程" count={<span className="text-[10px] text-ink-4">默认</span>} />
        <SideItem icon={<RotateCcw size={14} />} label="后补流程" count={<span className="text-[10px] text-orange">需确认</span>} />
      </SideSection>
      <SideSection title="草稿箱">
        <SideItem icon={<FileText size={14} />} label="迁移演练方案" count={<span className="text-[10px] text-ink-4">12:04</span>} />
        <SideItem icon={<FileText size={14} />} label="部门月度例会" count={<span className="text-[10px] text-ink-4">昨天</span>} />
      </SideSection>
    </>
  );
}

const MEMBERS = [
  { name: "陈思远", color: "#3B82F6", role: "后端 · 接口", daily: "每日 4h", range: "6/30 - 7/2", over: true },
  { name: "刘洋", color: "#2FB365", role: "数据校验", daily: "每日 3h", range: "6/30 - 7/3", over: false },
  { name: "赵敏", color: "#EC4899", role: "演练报告撰写", daily: "每日 2h", range: "7/2 - 7/4", over: true },
];

const CONFLICTS = [
  { name: "陈思远", color: "#3B82F6", text: "6/30 - 7/1 每日投入 12h，超过可用 8h" },
  { name: "赵敏", color: "#EC4899", text: "7/2 与「结对共建总结」全天任务冲突" },
];

const APPROVALS = [
  { name: "王建国", color: "#2FB365", sub: "中心主任 · 发起人", state: "已确认内容", stateColor: "#2FB365", done: true },
  { name: "张伟", color: "#2FB365", sub: "部门主任 · 负责人", state: "待确认时间", stateColor: "#F2970A", done: false },
  { name: "陈思远", color: "#3B82F6", sub: "任务成员", state: "待接收", stateColor: "#F2970A", done: false },
];

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-[11.5px] text-ink-3">{label}</p>
      {children}
    </div>
  );
}

const inputCls = "h-9 w-full rounded-sm border border-border bg-panel px-3 text-[12.5px] outline-none placeholder:text-ink-4 focus:border-accent";

export default function DispatchNewPage() {
  const router = useRouter();
  const [type, setType] = useState("科研·公司级");
  const [mode, setMode] = useState<"inner" | "cross">("inner");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const created = await api<{ id: string }>("/dispatch", {
        method: "POST",
        body: JSON.stringify({
          name: "智慧油田数据平台 · 数据中台迁移演练",
          type, project: "智慧油田数据平台", owner: "张伟",
          start_date: "2025-06-30", end_date: "2025-07-04", mode,
        }),
      });
      await api(`/dispatch/${created.id}/submit`, { method: "POST" }).catch(() => null);
      router.push("/inbox");
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Shell sidebar={<DispatchSidebar />}>
      <div className="flex items-center gap-2.5 border-b border-border px-7 py-3.5">
        <button onClick={() => router.back()} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-fill">
          <ArrowLeft size={16} className="text-ink-2" />
        </button>
        <h1 className="text-[16px] font-semibold">派发任务</h1>
        <Badge color="#2F6FED">标准流程</Badge>
        <span className="text-[12px] text-ink-3">发起人 王建国（中心主任）</span>
        <span className="ml-auto text-[11.5px] text-ink-4">草稿已自动保存 12:04</span>
      </div>

      <div className="grid grid-cols-[1.9fr_1fr] gap-3 p-7 pt-4">
        {/* 表单 */}
        <Card className="p-5">
          <Field label="任务类型">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cx(
                    "h-7 rounded-full px-3 text-[12px]",
                    type === t ? "bg-ink font-medium text-white" : "border border-border text-ink-2 hover:bg-fill",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="任务名称">
              <input className={inputCls} defaultValue="智慧油田数据平台 · 数据中台迁移演练" />
            </Field>
            <Field label="所属项目">
              <select className={inputCls} defaultValue="智慧油田数据平台">
                <option>智慧油田数据平台</option>
                <option>管道完整性管理系统</option>
                <option>巡检机器人研发</option>
              </select>
            </Field>
          </div>

          <Field label="任务概述" className="mt-4">
            <div className="relative">
              <textarea
                className="min-h-16 w-full resize-none rounded-sm border border-border p-3 text-[12.5px] outline-none focus:border-accent"
                defaultValue="完成数据中台从旧库到新平台的迁移演练，覆盖数据校验、回滚方案与切换窗口验证，输出演练报告…"
              />
              <span className="absolute top-2 right-3 text-[10.5px] text-ink-4">全过程留痕 · 当前第 1 版</span>
            </div>
          </Field>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Field label="负责人">
              <select className={inputCls} defaultValue="张伟 · 软件研发部">
                <option>张伟 · 软件研发部</option>
                <option>陈思远 · 软件研发部</option>
              </select>
            </Field>
            <Field label="开始时间">
              <div className="relative">
                <input className={inputCls} defaultValue="2025/06/30" />
                <Calendar size={14} className="absolute top-2.5 right-3 text-ink-4" />
              </div>
            </Field>
            <Field label="截止时间">
              <div className="relative">
                <input className={inputCls} defaultValue="2025/07/04" />
                <Calendar size={14} className="absolute top-2.5 right-3 text-ink-4" />
              </div>
            </Field>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11.5px] text-ink-3">成员与分工</p>
              <span className="text-[10.5px] text-ink-4">项目负责人选择成员 · 除上级指定外</span>
            </div>
            <div className="flex flex-col gap-2">
              {MEMBERS.map((m) => (
                <div
                  key={m.name}
                  className={cx(
                    "flex items-center gap-3 rounded-md border px-3 py-2.5",
                    m.over ? "border-orange/50 bg-[#FFFBF4]" : "border-border",
                  )}
                >
                  <Avatar name={m.name} color={m.color} size={26} />
                  <span className="text-[12.5px] font-medium">{m.name}</span>
                  <span className="text-[11.5px] text-ink-3">{m.role}</span>
                  <span className="ml-auto flex items-center gap-2 text-[11.5px]">
                    <span className={m.over ? "font-medium text-red" : "text-ink-2"}>{m.daily}</span>
                    <span className="text-ink-3">{m.range}</span>
                    {m.over && <Badge color="#EE4B43">负载超限</Badge>}
                    <button className="text-ink-4 hover:text-ink-2"><X size={13} /></button>
                  </span>
                </div>
              ))}
              <button className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-[12px] text-ink-3 hover:bg-fill">
                ＋ 添加成员 · 仅可选择有权限调配的人员
              </button>
            </div>
          </div>

          <Field label="派发方式" className="mt-4">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setMode("inner")}
                className={cx(
                  "flex items-start gap-2.5 rounded-md border p-3 text-left",
                  mode === "inner" ? "border-accent bg-accent-soft/40" : "border-border",
                )}
              >
                <span className={cx("mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border", mode === "inner" ? "border-accent" : "border-ink-4")}>
                  {mode === "inner" && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span>
                  <span className="block text-[12.5px] font-medium">部门内直接派发</span>
                  <span className="mt-0.5 block text-[11px] text-ink-3">成员均属软件研发部，无需授权</span>
                </span>
              </button>
              <button
                onClick={() => setMode("cross")}
                className={cx(
                  "flex items-start gap-2.5 rounded-md border p-3 text-left",
                  mode === "cross" ? "border-accent bg-accent-soft/40" : "border-border",
                )}
              >
                <span className={cx("mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border", mode === "cross" ? "border-accent" : "border-ink-4")}>
                  {mode === "cross" && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span>
                  <span className="block text-[12.5px] font-medium">跨部门派发</span>
                  <span className="mt-0.5 block text-[11px] text-ink-3">需对方部门主任 / 技术总监授权</span>
                </span>
              </button>
            </div>
          </Field>
        </Card>

        {/* 右侧 */}
        <div className="flex flex-col gap-3">
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange" />
              <h3 className="text-[13.5px] font-semibold">冲突检测</h3>
              <Badge color="#EE4B43">2 人超限</Badge>
            </div>
            {CONFLICTS.map((c) => (
              <div key={c.name} className="border-b border-border/60 py-2.5 last:border-0">
                <div className="flex items-center gap-2">
                  <Avatar name={c.name} color={c.color} size={22} />
                  <span className="text-[12.5px] font-medium">{c.name}</span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-2">{c.text}</p>
                <div className="mt-1.5 flex h-[6px] w-full overflow-hidden rounded-full">
                  <span className="h-full bg-blue" style={{ width: "62%" }} />
                  <span className="h-full bg-red" style={{ width: "24%" }} />
                  <span className="h-full bg-fill" style={{ width: "14%" }} />
                </div>
                <div className="mt-1 flex gap-3 text-[10.5px] text-ink-3">
                  <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-blue" />已排</span>
                  <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red" />超出部分</span>
                </div>
              </div>
            ))}
            <div className="mt-2 rounded-md bg-accent-soft p-3">
              <p className="text-[11.5px] font-medium text-accent">系统建议</p>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-2">将陈思远每日投入降至 2h，或迁移演练顺延 1 天，可解除全部冲突</p>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-[13.5px] font-semibold">审批与确认</h3>
            <p className="mt-0.5 mb-2 text-[10.5px] text-ink-4">任务概述任何变动将存档留痕</p>
            <div className="flex flex-col">
              {APPROVALS.map((a) => (
                <div key={a.name} className="flex items-center gap-2.5 py-2.5">
                  <span className={cx(
                    "flex h-[18px] w-[18px] items-center justify-center rounded-full",
                    a.done ? "bg-green text-white" : "border border-ink-4/50",
                  )}>
                    {a.done && <Check size={11} />}
                  </span>
                  <Avatar name={a.name} color={a.color} size={26} />
                  <div className="flex-1">
                    <p className="text-[12.5px] font-medium">{a.name}</p>
                    <p className="text-[10.5px] text-ink-3">{a.sub}</p>
                  </div>
                  <Badge color={a.stateColor}>{a.state}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* 底部操作条 */}
      <div className="sticky bottom-0 flex items-center border-t border-border bg-panel px-7 py-3">
        <span className="text-[11.5px] text-ink-3">提交后将通知 3 名成员，并占用其对应时段排程</span>
        <div className="ml-auto flex gap-2">
          <button className="h-8 rounded-sm border border-border px-3.5 text-[12.5px] text-ink-2" onClick={() => router.back()}>取消</button>
          <button className="h-8 rounded-sm border border-border px-3.5 text-[12.5px] text-ink-2">存草稿</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            <Send size={13} /> {submitting ? "派发中…" : "确认派发"}
          </button>
        </div>
      </div>
    </Shell>
  );
}
