"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid, Inbox, Briefcase, ClipboardList, Calendar, Users, Folder, Wrench, Bell, Settings, Search,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { useAuth, absorbPortalToken } from "@/lib/auth";
import { BrandIcon } from "@/components/brand-icon";

const NAV = [
  { href: "/", icon: LayoutGrid, key: "home" },
  { href: "/inbox", icon: Inbox, key: "inbox", badge: 3 },
  { href: "/projects", icon: Briefcase, key: "projects" },
  { href: "/my-work", icon: ClipboardList, key: "mywork", badge: 17 },
  { href: "/load", icon: Calendar, key: "load" },
  { href: "/team", icon: Users, key: "team" },
  { href: "/files", icon: Folder, key: "files" },
  { href: "/tools", icon: Wrench, key: "tools" },
];

function activeKey(pathname: string): string {
  if (pathname === "/" ) return "home";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/my-work") || pathname.startsWith("/dispatch")) return "mywork";
  if (pathname.startsWith("/load")) return "load";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/files")) return "files";
  if (pathname.startsWith("/tools")) return "tools";
  return "";
}

export function IconRail() {
  const pathname = usePathname();
  const key = activeKey(pathname);
  const user = useAuth((s) => s.user);
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center border-r border-border bg-panel py-3.5">
      <Link href="/" aria-label="NexusFlow 首页" className="mb-6 flex h-9 w-9 items-center justify-center rounded-[10px]">
        <BrandIcon />
      </Link>
      <div className="flex flex-col items-center gap-1.5">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = key === n.key;
          return (
            <Link
              key={n.key}
              href={n.href}
              className={cx(
                "relative flex h-10 w-10 items-center justify-center rounded-[8px] transition-colors",
                active ? "bg-accent-soft text-ink" : "text-ink-3 hover:bg-fill hover:text-ink",
              )}
            >
              <Icon size={19} strokeWidth={1.7} />
              {n.badge && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[9.5px] font-semibold text-white">
                  {n.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <button className="flex h-10 w-10 items-center justify-center rounded-[8px] text-ink-3 hover:bg-fill hover:text-ink">
          <Bell size={19} strokeWidth={1.7} />
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-[8px] text-ink-3 hover:bg-fill hover:text-ink">
          <Settings size={19} strokeWidth={1.7} />
        </button>
        <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-[7px] bg-fill text-[12.5px] font-semibold text-ink-2">
          {(user?.name || "陈").slice(0, 1)}
        </span>
      </div>
    </nav>
  );
}

export function SidebarFrame({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-border bg-panel">
      <div className="px-3 pt-3.5">
        <div className="flex h-8 items-center gap-2 rounded-[6px] border border-border bg-panel px-2.5 text-ink-3">
          <Search size={14} />
          <input
            className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
            placeholder="搜索或跳转"
          />
          <kbd className="rounded-[4px] border border-border px-1 py-0.5 text-[11px] text-ink-3">⌘K</kbd>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-4">{children}</div>
    </aside>
  );
}

export function Shell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const router = useRouter();
  const { user, checked, fetchMe } = useAuth();

  useEffect(() => {
    absorbPortalToken();
    if (!checked) fetchMe();
  }, [checked, fetchMe]);

  useEffect(() => {
    if (checked && !user) router.replace("/login");
  }, [checked, user, router]);

  if (!checked || !user) {
    return <div className="flex h-screen items-center justify-center bg-canvas text-[12.5px] text-ink-3">加载中…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <IconRail />
      <SidebarFrame>{sidebar}</SidebarFrame>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
