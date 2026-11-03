/** 主题自检：部署产物必须带上亮/暗 token、首屏定主题脚本和四套系统统一的外观控件。 */
const THEME_LABELS = ["跟随系统", "亮色", "暗色"];

export async function checkTheme(
  base: string,
  fetcher: typeof fetch = fetch,
  routes: string[] = ["/"],
) {
  const origin = base.replace(/\/+$/, "");
  let firstPage = "";
  const assets: string[] = [];
  const stylesheets: string[] = [];
  const scripts: string[] = [];

  for (const route of routes) {
    const pageUrl = new URL(origin + route);
    const page = await fetcher(pageUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!page.ok || !page.headers.get("content-type")?.includes("text/html")) {
      if (route === routes[0]) throw new Error(`Theme page must return HTML: ${pageUrl.href}`);
      continue;
    }
    const html = await page.text();
    if (!firstPage) firstPage = html;

    const hrefs = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map((m) => m[1]);
    if (!hrefs.length && route === routes[0]) throw new Error("Missing stylesheet link");
    stylesheets.push(...hrefs);
    scripts.push(
      ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]),
    );

    for (const href of [...new Set([...hrefs, ...scripts])]) {
      const res = await fetcher(new URL(href, pageUrl), { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (res.ok) assets.push(await res.text());
    }
  }

  if (!/<html\b[^>]*\bdata-theme=["'](light|dark)["']/i.test(firstPage)) throw new Error("Missing data-theme on <html>");
  if (!firstPage.includes("nexusflow-theme")) throw new Error("Missing theme init script (no flash-free first paint)");
  // 默认跟随系统：首屏脚本读系统偏好，只有手动选择才写存储。
  if (!firstPage.includes("prefers-color-scheme") || !firstPage.includes('"system"')) {
    throw new Error("Theme init script must default to following the system theme");
  }

  const bundle = assets.join("\n");
  if (!bundle.includes("[data-theme=dark]") && !bundle.includes('[data-theme="dark"]')) throw new Error("Missing dark theme tokens in CSS");
  if (!/color-scheme:\s*dark/.test(bundle)) throw new Error("Dark theme must set color-scheme:dark");
  if (!bundle.includes("--color-canvas") || !bundle.includes("--color-ink")) throw new Error("Missing design tokens in CSS");
  // 统一外观控件：账户行最右侧的小图标，一步轮换三种外观。
  for (const label of THEME_LABELS) {
    if (!bundle.includes(label)) throw new Error(`Missing theme option label: ${label}`);
  }
  if (!bundle.includes("theme-toggle") || !bundle.includes("点击切换到")) {
    throw new Error("Missing unified theme control (.theme-toggle)");
  }

  return {
    ok: true,
    page: new URL(origin + routes[0]).href,
    routes: routes.length,
    stylesheets: new Set(stylesheets).size,
    scripts: new Set(scripts).size,
    dark: true,
    light: true,
    control: "跟随系统|亮色|暗色",
  };
}
