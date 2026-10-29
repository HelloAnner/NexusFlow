"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid, Inbox, Briefcase, ClipboardList, Calendar, Building2, UserRound, Folder, Wrench, ShieldCheck,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { useAuth, absorbPortalToken } from "@/lib/auth";
import { BrandIcon } from "@/components/brand-icon";
import { UserMenu } from "@/components/user-menu";
import { Toaster } from "@/components/feedback";
import { ThemeToggle } from "@/components/theme-toggle";

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

/** 管理序列固定在侧栏底部，仅管理员可见。 */
const MANAGE_NAV = [
  { href: "/settings/users", icon: UserRound, key: "users", label: "用户管理" },
  { href: "/settings/departments", icon: Building2, key: "departments", label: "部门管理" },
  { href: "/settings/permissions", icon: ShieldCheck, key: "settings", label: "权限管理" },
];

function activeKey(pathname: string): string {
  if (pathname === "/" ) return "home";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/my-work") || pathname.startsWith("/dispatch")) return "mywork";
  if (pathname.startsWith("/load")) return "load";
  if (pathname.startsWith("/settings/users")) return "users";
  if (pathname.startsWith("/settings/departments")) return "departments";
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
  // AppWindow 里以 iframe 打开的设置页不需要侧栏壳，挂载后剥掉。
  const [inFrame, setInFrame] = React.useState(false);
  useEffect(() => setInFrame(window.self !== window.top), []);

  useEffect(() => {
    absorbPortalToken();
    if (!checked) fetchMe();
  }, [checked, fetchMe]);

  useEffect(() => {
    if (pathname !== "/login" && checked && !user) router.replace("/login");
  }, [pathname, checked, user, router]);

  if (pathname === "/login") return <>{children}</>;

  if (!checked || !user) {
    return <div className="flex h-screen items-center justify-center bg-canvas text-[12.5px] text-ink-3">加载中…</div>;
  }

  if (inFrame) return <main className="h-screen overflow-y-auto bg-canvas">{children}</main>;

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-panel">
        <Link href="/" className="flex items-center gap-2 px-4 pt-4 pb-2.5">
          <BrandIcon size={26} />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">NexusFlow</span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
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
          {manage ? (
            <div className="mt-auto border-t border-border/60">
              <p className="px-2 pt-3.5 pb-1 text-[11px] font-medium tracking-[0.02em] text-ink-3">管理</p>
              <div className="flex flex-col gap-0.5">
                {MANAGE_NAV.map((n) => {
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
          ) : null}
        </nav>

        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <UserMenu user={user} manage={manage} />
          <ThemeToggle />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      <Toaster />
    </div>
  );
}
