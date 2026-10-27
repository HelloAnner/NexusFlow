import type { GanttGroup, GanttTask } from "./demo";
import { isRecord, type QueryState } from "./query-state";
import { avatarColor, dayDiff, str } from "./utils";

export type PlanState =
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "ready"; project: Record<string, unknown>; groups: GanttGroup[]; start: string; days: number };

const TYPE_LABEL: Record<string, string> = {
  "research-company": "科研·公司级", "research-department": "科研·处级", "research-center": "科研·中心级",
  market: "市场", "business-trip": "出差", clerical: "文职", party: "党建", learning: "学习", leave: "休假",
};
const TYPE_COLOR: Record<string, string> = {
  "research-company": "#12855a", "research-department": "#12855a", "research-center": "#12855a",
  market: "#6d5bd0", "business-trip": "#b87407", clerical: "#2563eb", party: "#b04a7c",
  learning: "#12855a", leave: "#86868f",
};
const STATUS_TEXT: Record<string, string> = {
  draft: "草稿", pending_coordination: "待协调", in_progress: "进行中",
  pending_acceptance: "待验收", done: "已完成", archived: "已归档", cancelled: "已取消",
};

/** 把 /api/gantt 的扁平任务按「类型 · 负责人」分组，偏移量换算成项目起始日后的天数。 */
export function projectPlanState(id: string, projects: QueryState<Record<string, unknown>>, tasks: QueryState<unknown>): PlanState {
  if (projects.kind === "pending" || projects.kind === "error") return projects;
  const project = projects.kind === "ready" ? projects.items.find((row) => row.id === id) : undefined;
  if (!project) return { kind: "empty", message: "项目不存在或不可见" };
  if (tasks.kind === "pending" || tasks.kind === "error") return tasks;
  const start = project.start_date, end = project.end_date;
  if (typeof start !== "string" || typeof end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || dayDiff(start, end) < 0) {
    return { kind: "error", message: "项目计划周期不可用" };
  }
  const days = Math.max(1, dayDiff(start, end));

  const groups = new Map<string, GanttGroup>();
  for (const raw of tasks.kind === "ready" ? tasks.items : []) {
    if (!isRecord(raw)) continue;
    const taskId = str(raw.id);
    const name = str(raw.name, str(raw.title));
    if (!taskId || !name) continue;
    const s = dayDiff(start, str(raw.start_date)), e = dayDiff(start, str(raw.end_date));
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;

    const status = str(raw.status, "draft");
    const owner = str(raw.owner, str(raw.owner_id, "未指派"));
    const typeCode = str(raw.type, "other");
    const typeLabel = TYPE_LABEL[typeCode] ?? "其他";
    const key = `${typeLabel} · ${owner}`;
    const progress = Number(raw.progress);
    const closed = ["done", "archived"].includes(status);

    const item: GanttTask = {
      id: taskId,
      name,
      start: Math.max(0, Math.min(s, days)),
      end: Math.max(0, Math.min(e, days)),
      kind: closed ? "done" : status === "draft" || status === "pending_coordination" ? "plan" : "prog",
      ...(Number.isFinite(progress) ? { progress: closed ? 100 : Math.max(0, Math.min(100, progress)) } : {}),
      note: STATUS_TEXT[status] ?? status,
      popover: {
        owner, ownerColor: avatarColor(owner),
        plan: `${str(raw.start_date)} → ${str(raw.end_date)}`,
        forecast: STATUS_TEXT[status] ?? status,
        blockedBy: "—",
        code: taskId.slice(0, 8),
      },
    };

    const group = groups.get(key) ?? {
      type: typeLabel, typeColor: TYPE_COLOR[typeCode] ?? "#86868f", owner, ownerColor: avatarColor(owner), tasks: [],
    };
    group.tasks.push(item);
    groups.set(key, group);
  }

  const list = [...groups.values()];
  if (!list.length) return { kind: "empty", message: "该项目还没有任务，先去派发任务" };
  return { kind: "ready", project, groups: list, start, days };
}
