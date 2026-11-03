import { expect, test } from "bun:test";
import { checkTheme } from "../src/theme";

const html = '<html lang="zh-CN" data-theme="light"><head><link rel="stylesheet" href="/nexusflow/_next/static/css/a.css"></head><body><script src="/nexusflow/_next/static/js/a.js"></script><script>(function(){var s=localStorage.getItem("nexusflow-theme");var p=s==="dark"||s==="light"?s:"system";var d=window.matchMedia("(prefers-color-scheme: dark)");})();</script></body></html>';
const css = ':root{--color-canvas:#fff;--color-ink:#16161a}[data-theme=dark]{color-scheme:dark;--color-canvas:#0f0f12;--color-ink:#f2f2f5}.theme-toggle{width:26px}';
const js = 'const t=(p)=>p==="system"?"跟随系统":p==="light"?"亮色":"暗色";const a=`外观：${t(p)}（点击切换到${t(n)}）`;const c="theme-toggle";';

const fetcher = (page = html, sheet = css, script = js) => (async (url: string | URL | Request) => {
  const href = String(url);
  if (href.endsWith(".css")) return new Response(sheet, { headers: { "content-type": "text/css" } });
  if (href.endsWith(".js")) return new Response(script, { headers: { "content-type": "text/javascript" } });
  return new Response(page, { headers: { "content-type": "text/html" } });
}) as typeof fetch;

test("theme check requires data-theme, the init script, dark tokens and the unified control", async () => {
  const result = await checkTheme("https://example.test/nexusflow", fetcher());
  expect(result.ok).toBe(true);
  expect(result.stylesheets).toBe(1);
  expect(result.control).toBe("跟随系统|亮色|暗色");
  for (const bad of [
    fetcher(html.replace(' data-theme="light"', "")),
    fetcher(html.replace("nexusflow-theme", "other-theme")),
    fetcher(html.replace('"system"', '"light"')),
    fetcher(html, ":root{--color-canvas:#fff}"),
    fetcher(html, ":root{--color-canvas:#fff}[data-theme=dark]{color-scheme:dark}"),
    fetcher(html, css, 'const c="toggle";'),
    fetcher(html, css.replace(".theme-toggle{width:26px}", ""), js.replace('const c="theme-toggle";', "")),
    fetcher(html, css, js.replace("跟随系统", "自动")),
    fetcher(html, css, js.replace("点击切换到", "点击")),
  ]) {
    await expect(checkTheme("https://example.test/nexusflow", bad)).rejects.toThrow();
  }
});

test("额外路由失败时仍按首页判定，不重复计数样式表", async () => {
  const f = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith("/chat")) return new Response("nope", { status: 404 });
    return fetcher()(url);
  }) as typeof fetch;
  const result = await checkTheme("https://example.test/nexusflow", f, ["/", "/chat"]);
  expect(result.ok).toBe(true);
  expect(result.stylesheets).toBe(1);
});
