export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

// HTTP 页面不提供 randomUUID，但仍可使用 getRandomValues 生成标准 UUID v4。
export function newId(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== "function") throw new Error("当前浏览器不支持安全随机数，请更换浏览器");
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const DEMO_TODAY = "2025-06-24"; // 与设计稿一致的演示「今天」（周三）

export const AVATAR_COLORS = ["var(--color-green)", "var(--color-blue)", "var(--color-purple)", "var(--color-pink)", "var(--color-orange)", "var(--color-ink-2)"];

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

/**
 * 彩色徽标 / 图标的半透明底：颜色可能是 hex，也可能是 var(--color-*)（会随主题变），
 * 所以用 color-mix 而不是拼 `#rrggbb1A`。
 */
export const soft = (color: string, pct = 10) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
