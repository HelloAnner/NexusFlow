import { Suspense } from "react";
import GanttClient from "./gantt-client";

export default function PlanPage() {
  return <Suspense fallback={null}><GanttClient /></Suspense>;
}
