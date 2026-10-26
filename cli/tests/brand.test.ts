import { expect, test } from "bun:test";
import { checkBrand } from "../src/brand";

const html = '<link rel="icon" href="/nexusflow/favicon.svg?v=2" type="image/svg+xml">';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" data-brand="nexusflow"><path d="M0 0"/></svg>';
const fetcher = (page = html, image = svg, mime = "image/svg+xml") => (async (url: string | URL | Request) =>
  String(url).includes("favicon.svg") ? new Response(image, { headers: { "content-type": mime } }) :
    new Response(page, { headers: { "content-type": "text/html" } })) as typeof fetch;

test("brand check accepts the app SVG and rejects missing metadata, wrong prefixes, wrong identities and HTML fallbacks", async () => {
  const result = await checkBrand("https://example.test/nexusflow", "nexusflow", fetcher());
  expect(result.ok).toBe(true);
  expect(result.icon).toBe("https://example.test/nexusflow/favicon.svg?v=2");
  expect(result.sha256).toHaveLength(64);
  expect((await checkBrand("https://example.test", "nexusflow", fetcher())).ok).toBe(true);
  for (const bad of [fetcher("<html/>"), fetcher(html.replace("/nexusflow/", "/")), fetcher(html, svg.replace("nexusflow", "portal")), fetcher(html, "<html/>", "text/html")]) {
    await expect(checkBrand("https://example.test/nexusflow", "nexusflow", bad)).rejects.toThrow();
  }
});
