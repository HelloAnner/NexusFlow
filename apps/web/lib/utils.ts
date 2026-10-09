export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

export const DEMO_TODAY = "2025-06-24"; // 与设计稿一致的演示「今天」（周三）

export const AVATAR_COLORS = ["#2FB365", "#3B82F6", "#9B59F5", "#EC4899", "#F2970A", "#5F666D"];

export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const initial = (name: string) => (name || "?").slice(0, 1);

export function parseDay(s?: string): number {
  if (!s) return NaN;
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(t) ? NaN : t;
}

export const DAY_MS = 86400000;

export function addDays(base: string, n: number): string {
  const d = new Date(parseDay(base) + n * DAY_MS);
  return d.toISOString().slice(0, 10);
}

export function dayDiff(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
}

// 06/30 风格
export function md(s?: string): string {
  if (!s) return "—";
  const d = new Date(parseDay(s));
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// 6月30日 风格
export function mdCn(s?: string): string {
  if (!s) return "—";
  const d = new Date(parseDay(s));
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export const str = (v: unknown, fb = "") => (typeof v === "string" && v ? v : fb);
export const num = (v: unknown, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
