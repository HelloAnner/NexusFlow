"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Lock,
  RotateCcw,
  Search,
  Unlock,
} from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/utils";

/* 权限模型（人员 × 权限实体 × 查看/编辑/管理），数据来自本系统 /v1/rbac。 */

type RbacActionKey = "view" | "edit" | "manage";
type RbacEffect = "allow" | "deny";
type Mode = "quick" | "final";

interface RbacEntity {
  type: string;
  id: string;
  label: string;
  actions: RbacActionKey[];
  parent_id?: string;
}
interface RbacCatalog {
  system: string;
  entities: RbacEntity[];
}
interface RbacSubject {
  id: string;
  username: string;
  name?: string;
  role: string;
  roles?: string[];
  status: string;
  managed?: boolean;
}
interface RbacCell {
  type: string;
  id: string;
  action: RbacActionKey;
  allow: boolean;
  source: "role" | "allow" | "deny";
}
interface RbacMatrix {
  subject: RbacSubject;
  baseline_label: string;
  cells: RbacCell[];
  gates?: { type: string; id?: string; action: RbacActionKey; allow: boolean }[];
}
interface PermGroup {
  key: string;
  label: string;
  entities: RbacEntity[];
  children: Map<string, RbacEntity[]>;
  count: number;
}

const ACTIONS: { key: RbacActionKey; label: string }[] = [
  { key: "view", label: "查看" },
  { key: "edit", label: "编辑" },
  { key: "manage", label: "管理" },
];
const TYPE_LABEL: Record<string, string> = {
  feature: "功能权限",
  kb: "知识库",
  project: "项目",
  datasource: "数据连接",
  table: "数据表",
};
const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "拥有者",
  tenant_admin: "管理员",
  enterprise_admin: "管理员",
  team_admin: "团队管理员",
  project_lead: "项目负责人",
  center_director: "中心主任",
  center_deputy: "中心副主任",
  department_director: "部门主任",
  department_deputy: "部门副主任",
  super_admin: "超级管理员",
  member: "成员",
  user: "成员",
  end_user: "成员",
  viewer: "只读",
};

function groupOf(entity: RbacEntity): { key: string; label: string } {
  if (entity.type === "feature") return { key: "feature", label: TYPE_LABEL.feature! };
  if (entity.type === "table" && entity.parent_id) return { key: "datasource", label: TYPE_LABEL.datasource! };
  return { key: entity.type, label: TYPE_LABEL[entity.type] ?? entity.type };
}

function buildGroups(entities: RbacEntity[]): PermGroup[] {
  const groups: PermGroup[] = [];
  const index = new Map<string, PermGroup>();
  const get = (key: string, label: string): PermGroup => {
    const found = index.get(key);
    if (found) return found;
    const group: PermGroup = { key, label, entities: [], children: new Map(), count: 0 };
    index.set(key, group);
    groups.push(group);
    return group;
  };
  for (const entity of entities) {
    const { key, label } = groupOf(entity);
    const group = get(key, label);
    group.count += 1;
    if (entity.type === "table" && entity.parent_id) {
      const list = group.children.get(entity.parent_id);
      if (list) list.push(entity);
      else group.children.set(entity.parent_id, [entity]);
    } else {
      group.entities.push(entity);
    }
  }
  const rank = (key: string) => (key === "feature" ? 0 : key === "project" ? 1 : key === "kb" ? 2 : key === "datasource" ? 3 : 4);
  return groups.sort((a, b) => rank(a.key) - rank(b.key));
}

export default function PermissionsPage() {
  const [catalog, setCatalog] = useState<RbacCatalog | null>(null);
  const [subjects, setSubjects] = useState<RbacSubject[]>([]);
  const [matrix, setMatrix] = useState<RbacMatrix | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("quick");
  const [search, setSearch] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [groupTab, setGroupTab] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const matricesRef = useRef(new Map<string, RbacMatrix>());
  const selectedIdRef = useRef<string | null>(null);
  const matrixRequest = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readOnly = mode === "final";

  const notify = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };

  const loadMatrix = async (subjectId: string, force = false) => {
    if (selectedIdRef.current !== subjectId) return;
    const request = ++matrixRequest.current;
    if (!force) {
      const cached = matricesRef.current.get(subjectId);
      if (cached) {
        setMatrix(cached);
        return;
      }
    }
    // 重载（force）时保留旧表格直到新数据到达，避免页面闪动。
    setMatrix((prev) => (prev && prev.subject.id === subjectId ? prev : null));
    try {
      const result = await api<RbacMatrix>(`/v1/rbac/matrix?subject_id=${encodeURIComponent(subjectId)}`);
      if (request !== matrixRequest.current || selectedIdRef.current !== subjectId) return;
      matricesRef.current.set(subjectId, result);
      setMatrix(result);
    } catch (error) {
      if (request === matrixRequest.current && selectedIdRef.current === subjectId) {
        notify("error", error instanceof Error ? error.message : "权限矩阵加载失败");
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catalogResult, subjectResult] = await Promise.all([
          api<RbacCatalog>("/v1/rbac/catalog"),
          api<{ items: RbacSubject[] }>("/v1/rbac/subjects"),
        ]);
        if (cancelled) return;
        setCatalog(catalogResult);
        setSubjects(subjectResult.items);
        const first = subjectResult.items[0]?.id ?? null;
        selectedIdRef.current = first;
        setSelectedId(first);
        if (first) await loadMatrix(first);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "权限数据加载失败");
      }
    })();
    return () => {
      cancelled = true;
      selectedIdRef.current = null;
      matrixRequest.current += 1;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSubject = (subjectId: string) => {
    if (subjectId === selectedId) return;
    selectedIdRef.current = subjectId;
    setSelectedId(subjectId);
    setMatrix(null);
    setEntitySearch("");
    void loadMatrix(subjectId);
  };

  const setEffect = async (entity: RbacEntity, action: RbacActionKey, effect: RbacEffect | null) => {
    if (!matrix || readOnly) return;
    const subjectId = matrix.subject.id;
    const key = `${subjectId}|${entity.type}|${entity.id}|${action}`;
    if (pending.has(key)) return;
    setPending((prev) => new Set(prev).add(key));
    try {
      await api<{ cell: RbacCell }>("/v1/rbac/matrix", {
        method: "PUT",
        body: JSON.stringify({ subject_id: subjectId, type: entity.type, id: entity.id, action, effect }),
      });
      // 始终刷新这次操作的人员；切换人员后不把旧响应写入新矩阵。
      matricesRef.current.delete(subjectId);
      await loadMatrix(subjectId, true);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "保存失败，已恢复");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const toggleCell = (entity: RbacEntity, action: RbacActionKey, cell: RbacCell | undefined) => {
    const allow = cell?.allow ?? false;
    const source = cell?.source ?? "role";
    let effect: RbacEffect | null;
    if (allow) effect = "deny";
    else if (source === "deny" || source === "allow") effect = null;
    else effect = "allow";
    void setEffect(entity, action, effect);
  };

  const resetAll = async () => {
    if (!matrix || readOnly) return;
    const subject = matrix.subject;
    if (!window.confirm(`把 ${subject.name || subject.username} 的全部个人设置恢复为角色默认？`)) return;
    try {
      const result = await api<{ removed: number }>(
        `/v1/rbac/matrix?subject_id=${encodeURIComponent(subject.id)}`,
        { method: "DELETE" },
      );
      matricesRef.current.delete(subject.id);
      await loadMatrix(subject.id, true);
      notify("success", `已恢复 ${result.removed} 项个人设置`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "恢复默认失败");
    }
  };

  /* ---------- 衍生数据 ---------- */

  const cellLookup = new Map<string, RbacCell>();
  for (const cell of matrix?.cells ?? []) cellLookup.set(`${cell.type}|${cell.id}|${cell.action}`, cell);

  const gateFor = (entity: RbacEntity, action: RbacActionKey): boolean => {
    const gate = matrix?.gates?.find(
      (item) => item.type === entity.type && (item.id === undefined || item.id === entity.id) && item.action === action,
    );
    return gate ? gate.allow : true;
  };

  const groups = useMemo(() => buildGroups(catalog?.entities ?? []), [catalog]);
  const activeGroup = groupTab && groups.some((group) => group.key === groupTab) ? groupTab : groups[0]?.key ?? null;
  const currentGroup = groups.find((group) => group.key === activeGroup) ?? null;

  const keyword = search.trim().toLowerCase();
  const filteredSubjects = subjects.filter((subject) => {
    if (!keyword) return true;
    return [subject.name, subject.username, ROLE_LABEL[subject.role] ?? subject.role].some((value) =>
      (value ?? "").toLowerCase().includes(keyword),
    );
  });

  const renderLockCell = (entity: RbacEntity, action: (typeof ACTIONS)[number]) => {
    if (!entity.actions.includes(action.key)) {
      return <span key={action.key} className="w-[94px] select-none text-center text-[12px] text-ink-3">—</span>;
    }
    const cell = cellLookup.get(`${entity.type}|${entity.id}|${action.key}`);
    const allow = cell?.allow ?? false;
    const source = cell?.source ?? "role";
    const overridden = source === "allow" || source === "deny";
    const gate = gateFor(entity, action.key);
    const disabled = readOnly || !gate || pending.has(`${matrix?.subject.id}|${entity.type}|${entity.id}|${action.key}`) || !matrix;
    const title = !gate
      ? "该成员的角色不具备此功能，资源授权不会生效"
      : `${action.label}：${allow ? "允许" : "拒绝"}${overridden ? "（个人设置）" : "（角色默认）"}${readOnly ? "" : "，点击切换"}`;
    const icon = allow ? <Lock size={15} /> : <Unlock size={15} />;
    const color = source === "deny" ? "text-red" : allow ? "text-blue" : "text-ink-3";
    return (
      <span key={action.key} className="group/cell relative flex w-[94px] items-center justify-center">
        {readOnly ? (
          <span aria-label={`${entity.label} · ${action.label}权限`} title={title} className={cx("flex h-6 w-6 items-center justify-center", color, !gate && "opacity-35")}>
            {icon}
          </span>
        ) : (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={allow}
              aria-label={`${entity.label} · ${action.label}权限`}
              title={title}
              disabled={disabled}
              onClick={() => toggleCell(entity, action.key, cell)}
              className={cx(
                "relative flex h-6 w-6 items-center justify-center rounded-[4px] transition-colors",
                color,
                "hover:bg-fill hover:text-ink",
                disabled && "cursor-not-allowed opacity-30",
              )}
            >
              {icon}
              {overridden && <span className="absolute bottom-[2px] h-[3px] w-[3px] rounded-full bg-current opacity-90" />}
            </button>
            {overridden && (
              <button
                type="button"
                title="恢复角色默认"
                aria-label={`${entity.label} · ${action.label} · 恢复角色默认`}
                onClick={(event) => {
                  event.stopPropagation();
                  void setEffect(entity, action.key, null);
                }}
                className="absolute -top-1 right-[5px] hidden h-[14px] w-[14px] items-center justify-center rounded-full border border-border bg-panel p-0 text-ink-3 hover:text-ink group-hover/cell:flex group-focus-within/cell:flex"
              >
                <RotateCcw size={8} />
              </button>
            )}
          </>
        )}
      </span>
    );
  };

  /* ---------- 渲染 ---------- */

  const renderRows = () => {
    if (!currentGroup) return null;
    const kw = entitySearch.trim().toLowerCase();
    const match = (entity: RbacEntity) => !kw || entity.label.toLowerCase().includes(kw);
    const rows: ReactElement[] = [];
    const nameCell = (entity: RbacEntity, depth: number, caret?: ReactNode) => (
      <span className="flex min-w-0 flex-1 items-center gap-1 pl-2.5" style={{ paddingLeft: depth ? 14 + depth * 22 : 10 }}>
        {caret ?? <span className="h-4 w-4 shrink-0" />}
        <span
          className={cx(
            "truncate text-[12.5px]",
            depth === 0 && currentGroup.key === "datasource" ? "font-medium text-ink" : "text-ink-2",
          )}
          title={entity.label}
        >
          {entity.label}
        </span>
      </span>
    );

    if (currentGroup.key === "datasource") {
      for (const parent of currentGroup.entities) {
        const children = (currentGroup.children.get(parent.id) ?? []).filter(match);
        if (!match(parent) && children.length === 0) continue;
        const open = children.length > 0 && (!collapsed.has(parent.id) || Boolean(kw));
        const caret =
          children.length > 0 ? (
            <button
              type="button"
              aria-label={`${open ? "收起" : "展开"} ${parent.label}`}
              aria-expanded={open}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(parent.id)) next.delete(parent.id);
                  else next.add(parent.id);
                  return next;
                })
              }
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-ink-3 hover:bg-fill hover:text-ink"
            >
              <ChevronRight size={12} className={cx("transition-transform", open && "rotate-90")} />
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          );
        rows.push(
          <div key={`${parent.type}:${parent.id}`} className="flex min-h-8 items-center border-b border-border/60 hover:bg-fill">
            <span className="flex min-w-0 flex-1 items-center gap-1 pl-2.5">
              {caret}
              <span className="truncate text-[12.5px] font-medium text-ink" title={parent.label}>{parent.label}</span>
              {children.length > 0 && (
                <span className="shrink-0 rounded-[2px] bg-fill px-1.5 text-[10px] leading-[15px] text-ink-3">{children.length} 项</span>
              )}
            </span>
            {ACTIONS.map((action) => renderLockCell(parent, action))}
          </div>,
        );
        if (open) {
          for (const child of children) {
            rows.push(
              <div key={`${child.type}:${child.id}`} className="flex min-h-8 items-center border-b border-border/60 hover:bg-fill">
                {nameCell(child, 1)}
                {ACTIONS.map((action) => renderLockCell(child, action))}
              </div>,
            );
          }
        }
      }
      return rows;
    }

    for (const entity of currentGroup.entities) {
      if (!match(entity)) continue;
      rows.push(
        <div key={`${entity.type}:${entity.id}`} className="flex min-h-8 items-center border-b border-border/60 hover:bg-fill">
          {nameCell(entity, 0)}
          {ACTIONS.map((action) => renderLockCell(entity, action))}
        </div>,
      );
    }
    return rows;
  };

  const activeSubject = matrix?.subject ?? subjects.find((subject) => subject.id === selectedId);
  const tableRows = renderRows() ?? [];

  return (
    <div className="flex h-full min-h-[560px] flex-col px-6 py-4">
      {notice && (
        <div
          className={cx(
            "fixed top-5 right-5 z-[120] flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] font-medium backdrop-blur",
            notice.type === "success"
              ? "border-green/20 bg-green-soft text-green"
              : "border-red/20 bg-red-soft text-red",
          )}
        >
          {notice.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {notice.message}
        </div>
      )}

      {/* 顶部模式栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border">
        <div className="flex items-center gap-7">
          {[
            { key: "quick" as const, label: "权限快速配置" },
            { key: "final" as const, label: "用户最终权限" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={mode === item.key}
              onClick={() => setMode(item.key)}
              className={cx(
                "relative pb-3 text-[13.5px] transition-colors",
                mode === item.key ? "font-semibold text-blue" : "font-medium text-ink-3 hover:text-ink",
              )}
            >
              {item.label}
              {mode === item.key && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-t bg-blue" />}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-2 pb-2 text-[12px] text-ink-3">
          <span>当前查看维度：</span>
          <span className="text-ink-2">人员维度</span>
          {activeSubject && (
            <>
              <span className="text-border-strong">·</span>
              <span className="max-w-[160px] truncate font-medium text-ink-2">
                {activeSubject.name || activeSubject.username}
              </span>
            </>
          )}
          {mode === "quick" && matrix && (
            <button
              type="button"
              onClick={() => void resetAll()}
              className="ml-1 flex items-center gap-1 text-[12px] text-blue hover:underline"
            >
              <RotateCcw size={11} />
              全部恢复默认
            </button>
          )}
        </div>
      </div>

      {loadError ? (
        <div className="flex flex-1 items-center justify-center text-[12.5px] text-ink-3">{loadError}</div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 pt-3">
          {/* 左：人员名单 */}
          <aside className="flex w-[296px] shrink-0 flex-col overflow-hidden rounded-[8px] border border-border bg-panel">
            <div className="flex flex-col gap-2 border-b border-border bg-fill px-3 py-2.5">
              <div className="flex items-center justify-between text-[12px] font-semibold text-ink">
                <span>人员</span>
                <span className="rounded-full bg-accent-soft px-1.5 text-[10.5px] font-medium leading-[17px] text-ink-3">
                  {subjects.length}
                </span>
              </div>
              <div className="relative flex items-center">
                <Search size={13} className="pointer-events-none absolute left-2 text-ink-3" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索人员"
                  aria-label="搜索人员"
                  className="h-[27px] w-full rounded-[5px] border border-border bg-panel pl-7 pr-2 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/10"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredSubjects.length === 0 && (
                <div className="px-3 py-6 text-center text-[12px] text-ink-3">
                  {subjects.length === 0 ? "该系统中还没有成员" : "没有匹配的人员"}
                </div>
              )}
              {filteredSubjects.map((subject) => {
                const active = subject.id === selectedId;
                const role = subject.role || subject.roles?.[0] || "user";
                return (
                  <button
                    key={subject.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => selectSubject(subject.id)}
                    title={`${subject.name || subject.username} · ${subject.username} · ${ROLE_LABEL[role] ?? role}`}
                    className={cx(
                      "flex h-[33px] w-full items-center gap-2 border-b border-border/60 border-l-2 px-2.5 text-left transition-colors",
                      active ? "border-l-blue bg-blue/10" : "border-l-transparent hover:bg-fill",
                    )}
                  >
                    <span
                      className={cx(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-semibold",
                        active ? "bg-blue text-white" : "bg-fill text-ink-2",
                      )}
                    >
                      {(subject.name || subject.username || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                      {subject.name || subject.username}
                    </span>
                    <span className="shrink-0 rounded-[3px] border border-border px-1.5 text-[10.5px] leading-[16px] text-ink-3">
                      {ROLE_LABEL[role] ?? role}
                    </span>
                    <span
                      title={subject.status === "active" ? "正常" : "已停用"}
                      className={cx("h-[5px] w-[5px] shrink-0 rounded-full", subject.status === "active" ? "bg-green" : "bg-ink-3")}
                    />
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border px-3 py-[7px] text-[11px] text-ink-3">
              共 {subjects.length} 人{search ? `，匹配 ${filteredSubjects.length} 人` : ""}
            </div>
          </aside>

          {/* 右：目录权限 */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-2 flex min-h-7 items-center gap-2.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" role="tablist" aria-label="权限分组">
                {groups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    role="tab"
                    aria-selected={group.key === activeGroup}
                    onClick={() => setGroupTab(group.key)}
                    className={cx(
                      "flex h-7 items-center gap-1.5 rounded-[2px] border px-[11px] text-[12.5px] transition-colors",
                      group.key === activeGroup
                        ? "border-blue bg-blue/10 font-semibold text-blue"
                        : "border-border bg-panel font-medium text-ink-2 hover:border-border-strong hover:text-ink",
                    )}
                  >
                    {group.label}
                    <span className={cx("text-[10.5px] font-medium", group.key === activeGroup ? "text-blue" : "text-ink-3")}>
                      {group.count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="relative flex w-[168px] shrink-0 items-center">
                <Search size={13} className="pointer-events-none absolute left-2 text-ink-3" />
                <input
                  type="search"
                  value={entitySearch}
                  onChange={(event) => setEntitySearch(event.target.value)}
                  placeholder="搜索权限项"
                  aria-label="搜索权限项"
                  className="h-[27px] w-full rounded-[5px] border border-border bg-panel pl-7 pr-2 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-blue focus:ring-2 focus:ring-blue/10"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-[2px] border border-border bg-panel">
              {!matrix ? (
                <div className="flex h-full items-center justify-center text-[12.5px] text-ink-3">
                  {selectedId ? "正在加载权限…" : "请选择左侧人员"}
                </div>
              ) : (
                <>
                  <div className="sticky top-0 z-[2] flex h-[33px] items-center border-b border-border bg-fill pl-[13px] text-[11.5px] font-semibold text-ink-2">
                    <span className="min-w-0 flex-1">所有权限项</span>
                    {ACTIONS.map((action) => (
                      <span key={action.key} className="w-[94px] text-center">{action.label}</span>
                    ))}
                  </div>
                  {tableRows}
                  {tableRows.length === 0 && (
                    <div className="px-3 py-7 text-center text-[12px] text-ink-3">
                      {entitySearch ? "没有匹配的权限项" : "暂无权限项"}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3.5 pt-[7px] text-[10.5px] text-ink-3">
              {mode === "final" && <span className="text-blue">只读视图：角色默认 + 个人设置后的最终结果</span>}
              <span className="flex items-center gap-1"><Lock size={12} />已授权</span>
              <span className="flex items-center gap-1"><Unlock size={12} />未授权</span>
              <span className="flex items-center gap-1"><i className="h-[3px] w-[3px] rounded-full bg-blue" />个人设置（蓝=额外授权，红=单独拒绝）</span>
              <span>— 此权限项不支持该动作</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
