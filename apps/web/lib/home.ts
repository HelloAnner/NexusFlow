// 首页数据口径与派生计算：纯函数，便于核对真实接口字段。
// 接口来源：GET /api/home、GET /api/projects、GET /api/tools（见 apps/api/src/router.ts home()）。
import { dayDiff, md, num, str } from "./utils";

export type TaskRow = {
  id?: string; name?: string; title?: string; status?: string; type?: string; category?: string;
  start_date?: string; end_date?: string; daily_hours?: number; all_day?: boolean;
  progress?: number; project_id?: string; owner_id?: string; summary?: string;
};

export type ConflictRow = {
  task_id?: string; person_id?: string; type?: string; severity?: string;
  days?: string[]; title?: string; status?: string;
};

export type DailyLoad = {
  date?: string; hours?: number; capacity?: number; ratio?: number;
  overloaded?: boolean; locked?: boolean; task_count?: number;
};

export type TeamLoadPerson = { person_id?: string; name?: string; daily?: DailyLoad[] };

export type HomeResponse = {
  data_scope_applied?: boolean;
  today_focus?: TaskRow[];
  stats?: { today_due?: number; pending_approvals?: number; open_conflicts?: number; active_projects?: number };
  timeline?: TaskRow[];
  risk_radar?: ConflictRow[];
  team_load?: unknown[];
  team_load_7d?: { dates?: string[]; people?: TeamLoadPerson[] };
};

export type ProjectRow = { id?: string; name?: string; status?: string; progress?: number; level?: string; type?: string };
export type ToolRow = { id?: string; name?: string; category?: string; description?: string };

// ---------- 角色 / 状态 文案 ----------
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "中心领导",
  center_director: "中心领导",
  center_deputy: "中心副主任",
  department_director: "部门主任",
  department_deputy: "部门副主任",
  project_lead: "项目负责人",
  member: "项目成员",
};
export const roleLabel = (role?: string | null) => ROLE_LABEL[str(role, "")] || "项目成员";

export const TASK_STATUS_TEXT: Record<string, string> = {
  draft: "草稿", pending_confirmation: "待确认", in_progress: "进行中",
  pending_coordination: "待协调", pending_acceptance: "待验收",
  done: "已完成", archived: "已归档", cancelled: "已取消",
};
export const taskStatusText = (status?: string) => TASK_STATUS_TEXT[str(status, "")] || str(status, "未知");

export const PROJECT_STATUS_TEXT: Record<string, string> = {
  planning: "待启动", active: "进行中", paused: "已暂停", completed: "已完成", archived: "已归档",
};
export const PROJECT_STATUS_COLOR: Record<string, string> = {
  planning: "#878C94", active: "#2FB365", paused: "#F2970A", completed: "#878C94", archived: "#AEB4BB",
};
export const projectStatusText = (status?: string) => PROJECT_STATUS_TEXT[str(status, "")] || str(status, "未知");
export const projectStatusColor = (status?: string) => PROJECT_STATUS_COLOR[str(status, "")] || "#878C94";

// ---------- 日期 ----------
export const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const pad = (n: number) => String(n).padStart(2, "0");

/** 本地时区的 YYYY-MM-DD（接口所有日期口径都是本地日期字符串）。 */
export const todayISO = (now: Date) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const dateLabel = (now: Date) => `${now.getMonth() + 1}月${now.getDate()}日 ${WEEK_CN[now.getDay()]}`;
export const greetingAt = (now: Date) => (now.getHours() < 12 ? "早上好" : now.getHours() < 18 ? "下午好" : "晚上好");

/** 7 列网格的列标题：「周一 22」。 */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEK_CN[d.getDay()]} ${d.getDate()}`;
}

// ---------- 今日焦点 ----------
export type FocusRow = {
  id: string; title: string; tag: string; color: string; sub: string; route: string; rank: number;
};

export const taskTitle = (t: TaskRow) => str(t.name ?? t.title, "未命名任务");
export const isClosed = (t: TaskRow) => ["done", "archived", "cancelled"].includes(str(t.status, ""));
export const isOverdue = (t: TaskRow, today: string) =>
  !isClosed(t) && !!str(t.end_date, "") && str(t.end_date, "") < today;

/** 排序：逾期 > 冲突 > 今日截止 > 待验收/待确认 > 进行中。已结束的任务不进入焦点队列。 */
export function focusRows(tasks: TaskRow[], conflicts: ConflictRow[], today: string): FocusRow[] {
  const conflictTasks = new Set(conflicts.map((c) => str(c.task_id, "")).filter(Boolean));
  const kindOf = (t: TaskRow) => {
    if (isOverdue(t, today)) return "overdue";
    if (conflictTasks.has(str(t.id, ""))) return "conflict";
    if (str(t.end_date, "") === today) return "due";
    if (["pending_acceptance", "pending_confirmation", "draft"].includes(str(t.status, ""))) return "approval";
    return "active";
  };
  const KIND: Record<string, { tag: string; color: string; route: string; rank: number }> = {
    overdue: { tag: "逾期", color: "#EE4B43", route: "/my-work", rank: 0 },
    conflict: { tag: "冲突", color: "#F2970A", route: "/load", rank: 1 },
    due: { tag: "今日截止", color: "#2F6FED", route: "/my-work", rank: 2 },
    approval: { tag: "待处理", color: "#9B59F5", route: "/inbox", rank: 3 },
    active: { tag: "进行中", color: "#3B82F6", route: "/my-work", rank: 4 },
  };
  return tasks
    .filter((t) => !isClosed(t))
    .map((t) => {
      const kind = kindOf(t);
      const k = KIND[kind]!;
      const bits: string[] = [];
      if (t.start_date && t.end_date) bits.push(`${md(t.start_date)} - ${md(t.end_date)}`);
      if (t.daily_hours != null) bits.push(`每日 ${num(t.daily_hours)}h`);
      bits.push(kind === "overdue" ? `已逾期 ${dayDiff(str(t.end_date, ""), today)} 天` : taskStatusText(t.status));
      return {
        id: str(t.id, taskTitle(t)), title: taskTitle(t), tag: k.tag, color: k.color,
        sub: bits.join(" · "), route: k.route, rank: k.rank,
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

export const todayDueCount = (tasks: TaskRow[], today: string) =>
  tasks.filter((t) => str(t.end_date, "") === today).length;
export const overdueCount = (tasks: TaskRow[], today: string) => tasks.filter((t) => isOverdue(t, today)).length;

// ---------- 风险雷达 ----------
export const RISK_META: Record<string, { label: string; icon: string; color: string; route: string }> = {
  workload_overload: { label: "任务负载过载", icon: "activity", color: "#F2970A", route: "/load" },
  all_day_overlap: { label: "全天任务冲突", icon: "git-branch", color: "#EE4B43", route: "/load" },
  person_unavailable: { label: "成员不可用", icon: "user-x", color: "#9B59F5", route: "/load" },
  cross_department_approval: { label: "跨部门审批待办", icon: "stamp", color: "#3B82F6", route: "/inbox" },
  invalid_date_range: { label: "任务日期异常", icon: "calendar-clock", color: "#878C94", route: "/my-work" },
};
const FALLBACK_RISK = { label: "其他风险", icon: "alert-triangle", color: "#878C94", route: "/load" };

export type RiskGroup = { type: string; label: string; icon: string; color: string; route: string; count: number; blocking: number; people: number; days: number };

/** 按 type 分组计数；blocking 高的排前。 */
export function riskGroups(rows: ConflictRow[]): RiskGroup[] {
  const map = new Map<string, RiskGroup & { personIds: Set<string>; daySet: Set<string> }>();
  for (const row of rows) {
    const type = str(row.type, "unknown");
    const meta = RISK_META[type] || { ...FALLBACK_RISK, label: str(row.title, FALLBACK_RISK.label) };
    let g = map.get(type);
    if (!g) {
      g = { type, ...meta, count: 0, blocking: 0, people: 0, days: 0, personIds: new Set(), daySet: new Set() };
      map.set(type, g);
    }
    g.count += 1;
    if (str(row.severity, "") === "blocking") g.blocking += 1;
    if (row.person_id) g.personIds.add(str(row.person_id));
    for (const d of row.days || []) g.daySet.add(d);
  }
  return [...map.values()]
    .map(({ personIds, daySet, ...g }) => ({ ...g, people: personIds.size, days: daySet.size }))
    .sort((a, b) => b.blocking - a.blocking || b.count - a.count);
}

// ---------- 团队负载 ----------
export type HeatLevel = "idle" | "free" | "full" | "over";
export const HEAT_COLOR: Record<HeatLevel, string> = {
  idle: "#F4F4F2", free: "#E7F6EE", full: "#FCF0DB", over: "#FBE9E7",
};
export function heatLevel(ratio: number): HeatLevel {
  if (!Number.isFinite(ratio)) return "idle";
  if (ratio < 50) return "idle";
  if (ratio < 80) return "free";
  if (ratio < 100) return "full";
  return "over";
}

/** 团队负载 = 未来 7 天全部人/天的 ratio 平均值（%）。无数据返回 null。 */
export function avgTeamRatio(people: TeamLoadPerson[]): number | null {
  const ratios = people.flatMap((p) => (p.daily || []).map((d) => num(d.ratio, NaN)));
  const valid = ratios.filter((r) => Number.isFinite(r));
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}
export const overloadedPeople = (people: TeamLoadPerson[]) =>
  people.filter((p) => (p.daily || []).some((d) => d.overloaded === true)).length;

// ---------- 本周时间线 ----------
export type TimelineBar = {
  id: string; name: string; offset: number; width: number; color: string; progress: number;
  tip: { name: string; range: string; status: string };
};

/** 把真实起止日期映射到 7 列网格（第 0 列 = dates[0]，越过网格的裁剪到边界）。
 *  颜色：未解决冲突 = 红，已结束 = 绿，其余进行中 = 蓝。 */
export function timelineBars(tasks: TaskRow[], dates: string[], today: string, conflictTaskIds: Set<string> = new Set()): TimelineBar[] {
  if (!dates.length) return [];
  const start = dates[0]!;
  const span = dates.length;
  return tasks
    .map((t) => {
      const from = str(t.start_date, ""), to = str(t.end_date, "");
      if (!from || !to) return null;
      const head = dayDiff(start, from);
      const tail = dayDiff(start, to) + 1;
      const offset = Math.min(Math.max(head, 0), span);
      const end = Math.min(Math.max(tail, 0), span);
      if (end <= offset) return null;
      const conflict = conflictTaskIds.has(str(t.id, ""));
      const overdue = isOverdue(t, today);
      const color = conflict || overdue ? "#EE4B43" : isClosed(t) ? "#2FB365" : "#3B82F6";
      const state = conflict ? "冲突待协调" : overdue ? `逾期 · ${taskStatusText(t.status)}` : taskStatusText(t.status);
      return {
        id: str(t.id, taskTitle(t)), name: taskTitle(t), offset, width: Math.max(end - offset, 0.4),
        color, progress: isClosed(t) ? 100 : Math.min(100, Math.max(0, num(t.progress))),
        tip: { name: taskTitle(t), range: `${from} → ${to}`, status: state },
      };
    })
    .filter((x): x is TimelineBar => x !== null);
}

// ---------- 快捷工具 ----------
export const TOOL_ICON: Record<string, string> = {
  "pdf-convert": "file-output", translate: "languages", "paper-writing": "pen-line",
  "patent-writing": "stamp", "knowledge-base": "book-open", "platform-assistant": "message-circle",
  "meeting-minutes": "notebook-pen", "weekly-report": "calendar-check", "data-visualization": "bar-chart-3",
};
export const TOOL_COLOR: Record<string, string> = {
  "pdf-convert": "#EE4B43", translate: "#3B82F6", "paper-writing": "#9B59F5",
  "patent-writing": "#F2970A", "knowledge-base": "#2FB365", "platform-assistant": "#3B82F6",
  "meeting-minutes": "#5F666D", "weekly-report": "#EC4899", "data-visualization": "#2FB365",
};

export const arrOf = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
/** 集合接口统一返回 { items: [] }。 */
export const itemRows = <T,>(body: { items?: unknown } | undefined): T[] => arrOf<T>(body?.items);
