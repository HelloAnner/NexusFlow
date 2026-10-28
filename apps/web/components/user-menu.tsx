"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserRound, ShieldCheck, Moon, Sun, LogOut, X } from "lucide-react";
import { useAuth, type SessionUser } from "@/lib/auth";
import { apiBase } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { cx, initial } from "@/lib/utils";
import { roleLabel } from "@/lib/home";

/** 侧栏底部的用户入口：点开账户菜单，设置页以 AppWindow 弹层打开（与 Northline/DocuMind 一致）。 */
export function UserMenu({ user, manage }: { user: SessionUser; manage: boolean }) {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const [open, setOpen] = useState(false);
  const [windowPage, setWindowPage] = useState<{ href: string; title: string } | null>(null);

  const openWindow = (href: string, title: string) => {
    setOpen(false);
    setWindowPage({ href, title });
  };

  const item =
    "flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-fill hover:text-ink";

  return (
    <>
      {open && <button aria-label="关闭菜单" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} type="button" />}
      <div className="relative min-w-0 flex-1">
        {open && (
          <div className="absolute bottom-full left-0 z-40 mb-2 w-[220px] rounded-[10px] border border-border bg-panel p-2 shadow-lg">
            <div className="flex items-center gap-2.5 px-1.5 py-1.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-fill text-[13px] font-semibold text-ink-2">
                {initial(user.name || "?")}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold text-ink">{user.name || "—"}</span>
                <span className="truncate text-[11px] text-ink-3">{roleLabel(user.role)}</span>
              </div>
            </div>
            <div className="my-1.5 h-px bg-border" />
            <button type="button" className={item} onClick={() => openWindow("/profile", "个人设置")}>
              <UserRound size={16} strokeWidth={1.7} />个人设置
            </button>
            {manage && (
              <button type="button" className={item} onClick={() => openWindow("/settings/permissions", "租户设置")}>
                <ShieldCheck size={16} strokeWidth={1.7} />租户设置
              </button>
            )}
            <button type="button" className={item} onClick={toggleTheme}>
              {dark ? <Sun size={16} strokeWidth={1.7} /> : <Moon size={16} strokeWidth={1.7} />}
              {dark ? "切换亮色" : "切换暗色"}
            </button>
            <div className="my-1.5 h-px bg-border" />
            <button
              type="button"
              className={cx(item, "text-red hover:text-red")}
              onClick={() => {
                setOpen(false);
                void logout();
              }}
            >
              <LogOut size={16} strokeWidth={1.7} />退出登录
            </button>
          </div>
        )}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full min-w-0 items-center gap-2 rounded-[6px] text-left transition-colors hover:bg-fill"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-fill text-[12px] font-semibold text-ink-2">
            {initial(user.name || "?")}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12.5px] font-semibold text-ink">{user.name || "—"}</span>
            <span className="truncate text-[11px] text-ink-3">{roleLabel(user.role)}</span>
          </span>
        </button>
      </div>
      {windowPage ? <AppWindow {...windowPage} onClose={() => setWindowPage(null)} /> : null}
    </>
  );
}

/** 居中弹层 + iframe 加载站内设置页；Esc/背板关闭。 */
export function AppWindow({ href, title, onClose }: { href: string; title: string; onClose: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const requestClose = useCallback(() => {
    const frame = frameRef.current?.contentWindow;
    if (frame && !frame.dispatchEvent(new Event("nexusflow:before-close", { cancelable: true }))) return;
    onClose();
  }, [onClose]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [requestClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button aria-label={`关闭${title}`} className="absolute inset-0 bg-black/40" onClick={requestClose} type="button" />
      <section
        aria-label={title}
        aria-modal="true"
        role="dialog"
        className="relative overflow-hidden rounded-[16px] border border-border bg-canvas shadow-2xl"
        style={{ width: "min(1240px, calc(100vw - 48px))", height: "min(820px, calc(100vh - 48px))", minHeight: 480 }}
      >
        <iframe ref={frameRef} src={`${apiBase()}${href}`} title={title} style={{ border: 0, height: "100%", width: "100%" }} />
        <button
          aria-label={`关闭${title}`}
          onClick={requestClose}
          type="button"
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-[8px] border border-border bg-panel text-ink-3 transition-colors hover:text-ink"
        >
          <X size={16} />
        </button>
      </section>
    </div>,
    document.body,
  );
}
