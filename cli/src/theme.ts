/** 主题自检：部署产物必须带上亮/暗 token、首屏定主题脚本，否则暗色切换会闪或失效。 */
export async function checkTheme(base: string, fetcher: typeof fetch = fetch) {
  const pageUrl = new URL(base.replace(/\/+$/, "") + "/");
  const page = await fetcher(pageUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!page.ok || !page.headers.get("content-type")?.includes("text/html")) throw new Error("Theme page must return HTML");
  const html = await page.text();
  if (!/<html\b[^>]*\bdata-theme=["'](light|dark)["']/i.test(html)) throw new Error("Missing data-theme on <html>");
  if (!html.includes('nexusflow-theme')) throw new Error("Missing theme init script (no flash-free first paint)");

  const hrefs = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map((m) => m[1]);
  if (!hrefs.length) throw new Error("Missing stylesheet link");
  const css = (await Promise.all(hrefs.map(async (href) => {
    const url = new URL(href, pageUrl);
    const res = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    return res.ok ? res.text() : "";
  }))).join("\n");
  if (!css.includes("[data-theme=dark]") && !css.includes('[data-theme="dark"]')) throw new Error("Missing dark theme tokens in CSS");
  if (!/color-scheme:\s*dark/.test(css)) throw new Error("Dark theme must set color-scheme:dark");
  if (!css.includes("--color-canvas") || !css.includes("--color-ink")) throw new Error("Missing design tokens in CSS");
  return { ok: true, page: pageUrl.href, stylesheets: hrefs.length, dark: true, light: true };
}
