"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cx } from "@/lib/utils";

type ToastItem = { id: number; text: string; kind: "ok" | "err" };

let seq = 0;
const listeners = new Set<(t: ToastItem) => void>();

/** 任何页面都可以直接调用的操作反馈；成功/失败都要有回音，否则按钮看起来是死的。 */
export function toast(text: string, kind: "ok" | "err" = "ok") {
  const item = { id: ++seq, text, kind };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const add = (t: ToastItem) => {
      setItems((v) => [...v, t]);
      setTimeout(() => setItems((v) => v.filter((x) => x.id !== t.id)), 3200);
    };
    listeners.add(add);
    return () => { listeners.delete(add); };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx("rounded-[6px] px-3 py-2 text-[12.5px] shadow-lg", t.kind === "err" ? "bg-red text-white" : "bg-ink text-white")}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "操作失败，请重试";
}

export function Modal({
  open, title, onClose, children, footer, wide,
}: {
  open: boolean; title: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("flex max-h-full w-[440px] max-w-full flex-col rounded-lg border border-border bg-panel shadow-xl", wide && "w-[560px]")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <button onClick={onClose} aria-label="关闭" className="text-ink-3 hover:text-ink"><X size={15} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "h-8 w-full rounded-[6px] border border-border bg-panel px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-ink-4";
