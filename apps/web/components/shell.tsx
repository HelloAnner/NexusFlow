"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid, Inbox, Briefcase, ClipboardList, Calendar, Users, Folder, Wrench, ShieldCheck,
} from "lucide-react";
import { cx, initial } from "@/lib/utils";
import { useAuth, absorbPortalToken } from "@/lib/auth";
import { BrandIcon } from "@/components/brand-icon";
import { roleLabel } from "@/lib/home";
import { Toaster } from "@/components/feedback";

/** 一级导航：侧栏只放全局入口，页面内的筛选/目录留在页面里。 */
const NAV = [
  {
    section: "工作台",
    items: [
      { href: "/", icon: LayoutGrid, key: "home", label: "首页" },
      { href: "/inbox", icon: Inbox, key: "inbox", label: "收件箱" },
      { href: "/my-work", icon: ClipboardList, key: "mywork", label: "我的工作" },
    ],
  },
  {
    section: "项目与团队",
    items: [
      { href: "/projects", icon: Briefcase, key: "projects", label: "项目" },
      { href: "/load", icon: Calendar, key: "load", label: "负载与冲突" },
      { href: "/team", icon: Users, key: "team", label: "团队" },
    ],
  },
  {
    section: "资源",
    items: [
      { href: "/files", icon: Folder, key: "files", label: "资料库" },
      { href: "/tools", icon: Wrench, key: "tools", label: "工具台" },
    ],
  },
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
  if (pathname.startsWith("/settings")) return "settings";
  return "";
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const key = activeKey(pathname);
  const router = useRouter();
  const { user, checked, fetchMe } = useAuth();
  const manage = Boolean(user && ["super_admin", "center_director", "center_deputy", "department_director", "department_deputy"].includes(user.role));

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
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-panel">
        <Link href="/" className="flex items-center gap-2 px-4 pt-4 pb-2.5">
          <BrandIcon size={26} />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">NexusFlow</span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {manage ? (
            <div>
              <p className="px-2 pt-3.5 pb-1 text-[11px] font-medium tracking-[0.02em] text-ink-3">管理</p>
              <div className="flex flex-col gap-0.5">
                <Link
                  href="/settings/permissions"
                  aria-current={key === "settings" ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2 rounded-[6px] px-2 py-[7px] text-[13px] font-medium transition-colors",
                    key === "settings" ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-fill hover:text-ink",
                  )}
                >
                  <ShieldCheck size={16} strokeWidth={1.7} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">权限管理</span>
                </Link>
              </div>
            </div>
          ) : null}

          {NAV.map((group) => (
            <div key={group.section}>
              <p className="px-2 pt-3.5 pb-1 text-[11px] font-medium tracking-[0.02em] text-ink-3">{group.section}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((n) => {
                  const Icon = n.icon;
                  const active = key === n.key;
                  return (
                    <Link
                      key={n.key}
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-2 rounded-[6px] px-2 py-[7px] text-[13px] font-medium transition-colors",
                        active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-fill hover:text-ink",
                      )}
                    >
                      <Icon size={16} strokeWidth={1.7} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{n.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-fill text-[12px] font-semibold text-ink-2">
            {initial(user.name || "?")}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[12.5px] font-semibold text-ink">{user.name || "—"}</span>
            <span className="truncate text-[11px] text-ink-3">{roleLabel(user.role)}</span>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      <Toaster />
    </div>
  );
}
