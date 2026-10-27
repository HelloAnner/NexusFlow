import { expect, test } from "bun:test";
import { checkTheme } from "../src/theme";

const html = '<html lang="zh-CN" data-theme="light"><head><link rel="stylesheet" href="/nexusflow/_next/static/css/a.css"><script>(function(){localStorage.getItem("nexusflow-theme")})();</script></head><body></body></html>';
const css = ':root{--color-canvas:#fff;--color-ink:#16161a}[data-theme=dark]{color-scheme:dark;--color-canvas:#0f0f12;--color-ink:#f2f2f5}';
const fetcher = (page = html, sheet = css) => (async (url: string | URL | Request) =>
  String(url).endsWith(".css") ? new Response(sheet, { headers: { "content-type": "text/css" } }) :
    new Response(page, { headers: { "content-type": "text/html" } })) as typeof fetch;

test("theme check requires data-theme, the init script and dark tokens", async () => {
  const result = await checkTheme("https://example.test/nexusflow", fetcher());
  expect(result.ok).toBe(true);
  expect(result.stylesheets).toBe(1);
  for (const bad of [
    fetcher(html.replace(' data-theme="light"', "")),
    fetcher(html.replace("nexusflow-theme", "other-theme")),
    fetcher(html, ":root{--color-canvas:#fff}"),
    fetcher(html, ":root{--color-canvas:#fff}[data-theme=dark]{color-scheme:dark}"),
  ]) {
    await expect(checkTheme("https://example.test/nexusflow", bad)).rejects.toThrow();
  }
});
