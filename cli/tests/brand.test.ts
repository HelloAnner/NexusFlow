import { expect, test } from "bun:test";
import { checkBrand } from "../src/brand";

const bundle = 'document.title = tenant ? `${tenant} - 项目管理系统` : "NexusFlow";';
const html = '<link rel="icon" href="/nexusflow/favicon.svg?v=3" type="image/svg+xml"><script src="/nexusflow/app.js"></script>';
// Next 静态导出把 metadata 延迟进 RSC 载荷时，head 里只有转义形式。
const rsc = '<script>self.__next_f.push([1,"0:{\\"rel\\":\\"icon\\",\\"href\\":\\"/nexusflow/favicon.svg?v=3\\"}"])</script><script src="/nexusflow/app.js"></script>';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" data-brand="nexusflow"><path d="M0 0"/></svg>';
const fetcher = (page = html, image = svg, mime = "image/svg+xml", script = bundle) => (async (url: string | URL | Request) => {
  const href = String(url);
  if (href.includes("favicon.svg")) return new Response(image, { headers: { "content-type": mime } });
  if (href.includes(".js")) return new Response(script, { headers: { "content-type": "application/javascript" } });
  return new Response(page, { headers: { "content-type": "text/html" } });
}) as typeof fetch;

test("brand check accepts the app SVG and rejects missing metadata, wrong prefixes, wrong identities and HTML fallbacks", async () => {
  const result = await checkBrand("https://example.test/nexusflow", "nexusflow", fetcher());
  expect(result.ok).toBe(true);
  expect(result.icon).toBe("https://example.test/nexusflow/favicon.svg?v=3");
  expect(result.sha256).toHaveLength(64);
  expect(result.tabTitle).toBe("租户名 - 项目管理系统");
  expect((await checkBrand("https://example.test", "nexusflow", fetcher())).ok).toBe(true);
  expect((await checkBrand("https://example.test/nexusflow", "nexusflow", fetcher(rsc))).icon).toBe("https://example.test/nexusflow/favicon.svg?v=3");
  for (const bad of [fetcher("<html/>"), fetcher(html.replace("/nexusflow/", "/")), fetcher(html, svg.replace("nexusflow", "portal")), fetcher(html, "<html/>", "text/html"), fetcher(html, svg, "image/svg+xml", "")]) {
    await expect(checkBrand("https://example.test/nexusflow", "nexusflow", bad)).rejects.toThrow();
  }
});
