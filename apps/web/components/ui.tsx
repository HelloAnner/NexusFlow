"use client";

import React from "react";
import { Search, ChevronDown } from "lucide-react";
import { cx, initial } from "@/lib/utils";

export function Avatar({ name, color, size = 24, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial(name)}
    </span>
  );
}

export function Badge({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", className)}
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

export function PageHeader({ title, extra, right, className }: { title: React.ReactNode; extra?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 border-b border-border bg-canvas px-7 py-4", className)}>
      <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
      {extra}
      <div className="ml-auto flex items-center gap-2.5">{right}</div>
    </div>
  );
}

export function SearchBox({ placeholder, className }: { placeholder: string; className?: string }) {
  return (
    <div className={cx("flex h-8 items-center gap-2 rounded-sm border border-border bg-panel px-2.5 text-ink-3", className)}>
      <Search size={14} />
      <input className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-4" placeholder={placeholder} />
    </div>
  );
}

export function SideSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="px-3 pt-4">
      <button className="flex w-full items-center justify-between px-2 pb-1.5 text-[11px] text-ink-3" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <ChevronDown size={12} className={cx("transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

export function SideItem({
  icon, label, count, active, countColor, onClick, bold,
}: {
  icon?: React.ReactNode; label: React.ReactNode; count?: React.ReactNode; active?: boolean;
  countColor?: string; onClick?: () => void; bold?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 rounded-sm px-2 py-[5px] text-left text-[12.5px]",
        active ? "bg-accent-soft font-medium text-ink" : "text-ink-2 hover:bg-fill",
        bold && "font-semibold",
      )}
    >
      {icon && <span className="flex w-4 shrink-0 items-center justify-center text-ink-3">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-[11px]" style={{ color: countColor || "#AEB4BB" }}>{count}</span>
      )}
    </button>
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
  return <div className="flex items-center justify-center py-14 text-[12.5px] text-ink-4">{text}</div>;
}

export function Empty({ text = "暂无数据" }: { text?: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-14 text-[12.5px] text-ink-4">{text}</div>;
}

export const STATUS_COLOR: Record<string, string> = {
  正常: "#2FB365", 风险: "#F2970A", 逾期: "#EE4B43", 完成: "#878C94", 已完成: "#2FB365",
  未启动: "#878C94", 过载: "#EE4B43", 饱和: "#F2970A", 空闲: "#2FB365", 全天锁定: "#5F666D",
  进行中: "#3B82F6",
};

export const TYPE_COLOR: Record<string, string> = {
  科研: "#2FB365", 市场: "#9B59F5", 出差: "#F2970A", 文职: "#3B82F6",
  党建: "#EC4899", 学习: "#2FB365", 休假: "#878C94",
};
