"use client";

import React from "react";
import { Search } from "lucide-react";
import { cx, initial } from "@/lib/utils";

export function Avatar({ name, color, size = 24, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-[7px] font-semibold", className)}
      style={{ width: size, height: size, background: `${color}1A`, color, fontSize: size * 0.42 }}
    >
      {initial(name)}
    </span>
  );
}

export function Badge({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-[4px] px-[7px] py-px text-[11.5px] font-medium whitespace-nowrap", className)}
      style={{ color, background: `${color}1A` }}
    >
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-lg border border-border bg-panel", className)}>{children}</div>;
}

export function Bar({ value, color, className, height = 5 }: { value: number; color: string; className?: string; height?: number }) {
  return (
    <div className={cx("w-full overflow-hidden rounded-full bg-fill", className)} style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

export function PageHeader({ title, sub, extra, right, className }: { title: React.ReactNode; sub?: React.ReactNode; extra?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 px-6 pt-5 pb-1", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {sub ? <p className="text-[12.5px] text-ink-3">{sub}</p> : null}
      </div>
      {extra}
      <div className="flex shrink-0 items-center gap-2.5">{right}</div>
    </div>
  );
}

export function SearchBox({ placeholder, className, value, onChange }: { placeholder: string; className?: string; value?: string; onChange?: (v: string) => void }) {
  return (
    <div className={cx("flex h-8 items-center gap-2 rounded-sm border border-border bg-panel px-2.5 text-ink-3", className)}>
      <Search size={14} />
      <input
        className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}

// 项目标记：彩色描边 圆/方/三角/虚线圆
export function Marker({ color, shape = "circle", size = 14 }: { color: string; shape?: "circle" | "square" | "triangle" | "dash"; size?: number }) {
  const sw = 1.6;
  if (shape === "square")
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0">
        <rect x="2.5" y="2.5" width="9" height="9" rx="2" fill="none" stroke={color} strokeWidth={sw} />
      </svg>
    );
  if (shape === "triangle")
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0">
        <path d="M7 2.8 L12 11 L2 11 Z" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0">
      <circle cx="7" cy="7" r="4.6" fill="none" stroke={color} strokeWidth={sw} strokeDasharray={shape === "dash" ? "2.4 2" : undefined} />
    </svg>
  );
}

export function Loading({ text = "加载中…" }: { text?: string }) {
  return <div className="flex items-center justify-center py-14 text-[12.5px] text-ink-3">{text}</div>;
}

export function Empty({ text = "暂无数据" }: { text?: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-14 text-[12.5px] text-ink-3">{text}</div>;
}

export const STATUS_COLOR: Record<string, string> = {
  正常: "#12855a", 风险: "#b87407", 逾期: "#d92d20", 完成: "#86868f", 已完成: "#12855a",
  未启动: "#86868f", 过载: "#d92d20", 饱和: "#b87407", 空闲: "#12855a", 全天锁定: "#4a4a52",
  进行中: "#2563eb",
};

export const TYPE_COLOR: Record<string, string> = {
  科研: "#12855a", 市场: "#6d5bd0", 出差: "#b87407", 文职: "#2563eb",
  党建: "#b04a7c", 学习: "#12855a", 休假: "#86868f",
};
