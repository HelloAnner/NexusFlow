import { expect, test } from "bun:test";
import { buildDemoSeed, demoTools } from "../src/demo-seed.ts";

test("demo seed matches the six-project, ten-member design", () => {
  const seed = buildDemoSeed("2026-06-22");
  expect(seed.projects.map(x => x.name)).toEqual([
    "智慧油田数据平台", "管道完整性管理", "北线调度优化", "巡检机器人研发", "数字化转型咨询", "等保测评专项",
  ]);
  expect(seed.people.map(x => x.name)).toEqual([
    "王建国", "李文静", "张伟", "陈思远", "刘洋", "赵敏", "孙倩", "周杰", "吴迪", "王强",
  ]);
  expect(seed.people.every(x => x.title && x.skills.length > 0)).toBe(true);
  expect(seed.projects.filter(x => x.status === "active")).toHaveLength(4);
  expect(seed.projects.every(x => x.level && x.type)).toBe(true);
});

test("demo seed contains dated Gantt groups, conflict samples, and all nine tools", () => {
  const seed = buildDemoSeed("2026-06-22");
  expect([...new Set(seed.tasks.map(x => x.category))]).toEqual(["科研", "市场", "出差", "文职", "党建"]);
  expect(seed.tasks).toHaveLength(15);
  expect(seed.tasks.every(x => x.start_date < x.end_date && x.progress >= 0 && x.progress <= 100)).toBe(true);
  expect(seed.conflicts).toHaveLength(3);
  expect(demoTools).toHaveLength(9);
  expect(demoTools.map(x => x.name)).toContain("数据可视化");
});
