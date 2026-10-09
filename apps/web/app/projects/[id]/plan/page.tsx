import { PROJECTS } from "@/lib/demo";
import GanttClient from "./gantt-client";

// 静态导出需要枚举所有项目 id
export function generateStaticParams() {
  return PROJECTS.map((p) => ({ id: p.id }));
}

export default function PlanPage() {
  return <GanttClient />;
}
