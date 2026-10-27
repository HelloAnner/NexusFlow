"use client";

import { Shield } from "lucide-react";
import { Shell } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { RbacPanelHost } from "@/components/rbac-panel-host";
import { api } from "@/lib/api";
import type {
  RbacAdapter, RbacCatalog, RbacMatrix, RbacSubject,
} from "@/lib/rbac/panel";

const adapter: RbacAdapter = {
  loadCatalog: () => api<RbacCatalog>("/v1/rbac/catalog"),
  loadSubjects: () => api<{ items: RbacSubject[] }>("/v1/rbac/subjects"),
  loadMatrix: (subjectId) =>
    api<RbacMatrix>(`/v1/rbac/matrix?subject_id=${encodeURIComponent(subjectId)}`),
  setCell: (input) =>
    api<{ cell: RbacMatrix["cells"][number] }>("/v1/rbac/matrix", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  resetAll: (subjectId) =>
    api<{ removed: number }>(
      `/v1/rbac/matrix?subject_id=${encodeURIComponent(subjectId)}`,
      { method: "DELETE" },
    ),
};

export default function PermissionsPage() {
  return (
    <Shell>
      <PageHeader
        title={<span className="flex items-center gap-2"><Shield size={17} />权限管理</span>}
        sub="左侧选择成员，右侧用锁开关调整项目与功能权限"
      />
      <div className="px-6 py-4" style={{ height: "calc(100vh - 96px)" }}>
        <RbacPanelHost adapter={adapter} />
      </div>
    </Shell>
  );
}
