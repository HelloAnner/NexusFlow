"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Lock, RotateCcw, Shield, Unlock } from "lucide-react";
import { Avatar, Badge, Card, Empty, Loading, PageHeader, SearchBox } from "@/components/ui";
import { api } from "@/lib/api";
import { cx } from "@/lib/utils";

/* 权限模型（人员 × 权限实体 × 查看/编辑/管理），数据来自本系统 /v1/rbac。 */

type RbacActionKey = "view" | "edit" | "manage";
type RbacEffect = "allow" | "deny";
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

const ACTIONS: { key: RbacActionKey; label: string }[] = [
  { key: "view", label: "查看" },
  { key: "edit", label: "编辑" },
  { key: "manage", label: "管理" },
];
const TYPE_LABEL: Record<string, string> = {
  feature: "功能权限",
  kb: "知识库",
  project: "项目",
  datasource: "数据源",
  table: "数据表",
};
const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "拥有者",
  tenant_admin: "管理员",
  enterprise_admin: "管理员",
  team_admin: "团队管理员",
  project_lead: "项目负责人",
  center_director: "中心主任",
  member: "成员",
  user: "成员",
  end_user: "成员",
  viewer: "只读",
};

function groupKey(entity: RbacEntity): string {
  if (entity.type === "feature") return "feature";
  if (entity.type === "table" && entity.parent_id) return `table:${entity.parent_id}`;
  return `type:${entity.type}`;
}

function groupLabel(key: string, catalog: RbacCatalog | null): string {
  if (key === "feature") return "功能权限";
  if (key.startsWith("table:")) {
    const parent = key.slice("table:".length);
    const parentEntity = catalog?.entities.find((item) => item.id === parent && item.type !== "table");
    return `${parentEntity?.label ?? parent} · 数据表`;
  }
  return TYPE_LABEL[key.slice("type:".length)] ?? key;
}

export default function PermissionsPage() {
  const [catalog, setCatalog] = useState<RbacCatalog | null>(null);
  const [subjects, setSubjects] = useState<RbacSubject[]>([]);
  const [matrix, setMatrix] = useState<RbacMatrix | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groupTab, setGroupTab] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const matricesRef = useRef(new Map<string, RbacMatrix>());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };

  const loadMatrix = async (subjectId: string, force = false) => {
    if (!force) {
      const cached = matricesRef.current.get(subjectId);
      if (cached) {
        setMatrix(cached);
        return;
      }
    }
    setMatrix(null);
    try {
      const result = await api<RbacMatrix>(`/v1/rbac/matrix?subject_id=${encodeURIComponent(subjectId)}`);
      matricesRef.current.set(subjectId, result);
      setMatrix(result);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "权限矩阵加载失败");
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
        setSelectedId(first);
        if (first) await loadMatrix(first);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "权限数据加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSubject = (subjectId: string) => {
    if (subjectId === selectedId) return;
    setSelectedId(subjectId);
    setMatrix(null);
    void loadMatrix(subjectId);
  };

  const setEffect = async (entity: RbacEntity, action: RbacActionKey, effect: RbacEffect | null) => {
    if (!matrix) return;
    const key = `${entity.type}|${entity.id}|${action}`;
    if (pending.has(key)) return;
    setPending((prev) => new Set(prev).add(key));
    try {
      const result = await api<{ cell: RbacCell }>("/v1/rbac/matrix", {
        method: "PUT",
        body: JSON.stringify({ subject_id: matrix.subject.id, type: entity.type, id: entity.id, action, effect }),
      });
      // 功能/数据源变更会影响后代或闸门，整表重载；其余只更新一格。
      if (entity.type === "feature" || entity.type === "datasource") {
        matricesRef.current.delete(matrix.subject.id);
        await loadMatrix(matrix.subject.id, true);
      } else {
        setMatrix((prev) => {
          if (!prev) return prev;
          const cells = [...prev.cells];
          const index = cells.findIndex(
            (cell) => cell.type === entity.type && cell.id === entity.id && cell.action === action,
          );
          if (index >= 0) cells[index] = result.cell;
          else cells.push(result.cell);
          const next = { ...prev, cells };
          matricesRef.current.set(prev.subject.id, next);
          return next;
        });
      }
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
    if (!matrix) return;
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

  const grouped = new Map<string, RbacEntity[]>();
  for (const entity of catalog?.entities ?? []) {
    const key = groupKey(entity);
    const list = grouped.get(key);
    if (list) list.push(entity);
    else grouped.set(key, [entity]);
  }
  const groupKeys = [...grouped.keys()].sort((a, b) => {
    const rank = (key: string) => (key === "feature" ? 0 : key.startsWith("table:") ? 2 : 1);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const activeGroup = groupTab && grouped.has(groupTab) ? groupTab : grouped.has("feature") ? "feature" : groupKeys[0] ?? null;

  const keyword = search.trim().toLowerCase();
  const filteredSubjects = subjects.filter((subject) => {
    if (!keyword) return true;
    return [subject.name, subject.username, subject.role].some((value) =>
      (value ?? "").toLowerCase().includes(keyword),
    );
  });

  const renderLockCell = (entity: RbacEntity, action: (typeof ACTIONS)[number]) => {
    if (!entity.actions.includes(action.key)) {
      return (
        <span key={action.key} className="w-14 select-none text-center text-[12px] text-ink-4">
          —
        </span>
      );
    }
    const cell = cellLookup.get(`${entity.type}|${entity.id}|${action.key}`);
    const allow = cell?.allow ?? false;
    const overridden = cell?.source === "allow" || cell?.source === "deny";
    const gate = gateFor(entity, action.key);
    const disabled = !gate || pending.has(`${entity.type}|${entity.id}|${action.key}`) || !matrix;
    return (
      <span key={action.key} className="group/cell relative flex w-14 items-center justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={allow}
          aria-label={`${entity.label} · ${action.label}权限`}
          title={
            !gate
              ? "该成员的角色不具备此功能，资源授权不会生效"
              : `${action.label}：${allow ? "允许" : "拒绝"}${overridden ? "（个人设置）" : "（角色默认）"}，点击切换`
          }
          disabled={disabled}
          onClick={() => toggleCell(entity, action.key, cell)}
          className={cx(
            "relative flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border transition-colors",
            allow
              ? "border-transparent bg-accent text-canvas"
              : "border-border bg-fill text-ink-3 hover:text-ink-2",
            disabled && "cursor-not-allowed opacity-35",
          )}
        >
          {allow ? <Unlock size={11} /> : <Lock size={11} />}
          {overridden && (
            <span className="absolute bottom-[2px] h-[3px] w-[3px] rounded-full bg-current opacity-90" />
          )}
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
            className="absolute -top-1 right-1 flex h-[14px] w-[14px] items-center justify-center rounded-full border border-border bg-panel p-0 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover/cell:opacity-100"
          >
            <RotateCcw size={8} />
          </button>
        )}
      </span>
    );
  };

  /* ---------- 渲染 ---------- */

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Shield size={17} />权限管理</span>}
        sub="左侧选择成员，右侧按权限类型用锁开关调整查看、编辑与管理权限"
      />
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
      <div className="flex items-start gap-5 px-6 py-4">
        {/* 左：成员 */}
        <aside className="w-[236px] shrink-0">
          <SearchBox placeholder="搜索成员" value={search} onChange={setSearch} />
          <Card className="mt-2.5 overflow-hidden">
            {filteredSubjects.length === 0 && (
              <div className="px-3 py-5 text-center text-[12px] text-ink-3">
                {subjects.length === 0 ? "该系统中还没有成员" : "没有匹配的成员"}
              </div>
            )}
            {filteredSubjects.map((subject, index) => {
              const active = subject.id === selectedId;
              const role = subject.role || subject.roles?.[0] || "user";
              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => selectSubject(subject.id)}
                  className={cx(
                    "flex w-full cursor-pointer items-center gap-2.5 border-0 px-3 py-2 text-left transition-colors",
                    index > 0 && "border-t border-border/60",
                    active ? "bg-accent-soft" : "bg-transparent hover:bg-fill",
                  )}
                >
                  <Avatar name={subject.name || subject.username || "?"} color={active ? "var(--color-ink)" : "var(--color-blue)"} size={26} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[12.5px] font-medium text-ink">{subject.name || subject.username}</span>
                    <span className="truncate text-[10.5px] text-ink-3">{subject.username}</span>
                  </span>
                  <Badge color={role === "tenant_owner" || role === "tenant_admin" || role === "project_lead" ? "var(--color-purple)" : "var(--color-ink-3)"}>
                    {ROLE_LABEL[role] ?? role}
                  </Badge>
                  <span
                    title={subject.status === "active" ? "正常" : "已停用"}
                    className={cx("h-[5px] w-[5px] shrink-0 rounded-full", subject.status === "active" ? "bg-green" : "bg-ink-4")}
                  />
                </button>
              );
            })}
          </Card>
          <div className="mt-2 text-[11px] text-ink-3">
            共 {subjects.length} 人{search ? `，匹配 ${filteredSubjects.length} 人` : ""}
          </div>
        </aside>

        {/* 右：权限明细 */}
        <section className="min-w-0 flex-1">
          {loadError ? (
            <Empty text={loadError} />
          ) : !catalog || !matrix ? (
            <Loading text={selectedId || !catalog ? "正在加载权限…" : "请选择左侧成员"} />
          ) : (
            <>
              <div className="mb-2.5 flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                    {matrix.subject.name || matrix.subject.username}
                  </span>
                  <span className="text-[11.5px] text-ink-3">
                    {matrix.subject.username} · {matrix.baseline_label}
                    {matrix.subject.managed === false ? " · 仅本系统账号" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void resetAll()}
                  className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-transparent px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-fill"
                >
                  <RotateCcw size={12} />
                  全部恢复默认
                </button>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3.5 rounded-sm border border-border bg-panel px-2.5 py-[7px] text-[11px] text-ink-3">
                <b className="flex items-center gap-1.5 font-medium text-ink-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-accent text-canvas">
                    <Unlock size={9} />
                  </span>
                  允许
                </b>
                <b className="flex items-center gap-1.5 font-medium text-ink-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-[5px] border border-border bg-fill text-ink-3">
                    <Lock size={9} />
                  </span>
                  拒绝
                </b>
                <b className="flex items-center gap-1.5 font-medium">
                  <span className="h-1 w-1 rounded-full bg-current" />
                  个人设置（无点=角色默认）
                </b>
              </div>

              {/* 权限类型横向 tab */}
              <div className="mb-3 flex w-fit max-w-full flex-wrap items-center gap-[2px] rounded-sm border border-border bg-fill p-[2px]">
                {groupKeys.map((key) => {
                  const active = key === activeGroup;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setGroupTab(key)}
                      className={cx(
                        "flex h-[26px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[5px] border-0 px-2.5 text-[12px] transition-colors",
                        active ? "bg-panel font-medium text-ink" : "bg-transparent text-ink-3 hover:text-ink-2",
                      )}
                    >
                      {groupLabel(key, catalog)}
                      <span className="rounded-full bg-accent-soft px-[5px] text-[10px] text-ink-3">
                        {grouped.get(key)?.length ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeGroup && (
                <Card className="overflow-hidden">
                  <div className="flex items-center border-b border-border bg-fill px-3.5 py-[7px]">
                    <span className="min-w-0 flex-1 text-[10.5px] font-medium text-ink-3">名称</span>
                    {ACTIONS.map((action) => (
                      <span key={action.key} className="w-14 text-center text-[10.5px] font-medium text-ink-3">
                        {action.label}
                      </span>
                    ))}
                  </div>
                  {(grouped.get(activeGroup) ?? []).map((entity, index) => (
                    <div
                      key={`${entity.type}:${entity.id}`}
                      className={cx(
                        "flex min-h-8 items-center px-3.5 py-[3px]",
                        index > 0 && "border-t border-border/60",
                      )}
                    >
                      <span
                        className="flex min-w-0 flex-1 items-baseline gap-1.5"
                        style={{ paddingLeft: activeGroup.startsWith("table:") ? 14 : 0 }}
                      >
                        <span className="truncate text-[12.5px] text-ink-2" title={entity.label}>
                          {entity.label}
                        </span>
                        {entity.type === "feature" && (
                          <span className="shrink-0 text-[10px] text-ink-3">功能</span>
                        )}
                      </span>
                      {ACTIONS.map((action) => renderLockCell(entity, action))}
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
