import { str } from "./utils";

export type OrgNode = {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  enabled?: boolean;
  children?: OrgNode[];
};

export type OrgFlat = { id: string; name: string; type: string; depth: number };

export const ORG_TYPE_LABEL: Record<string, string> = {
  company: "公司",
  second_level: "二级单位",
  center: "中心",
  department: "部门",
  studio: "工作室",
};

export const ORG_TYPE_OPTIONS = Object.entries(ORG_TYPE_LABEL).map(([value, label]) => ({ value, label }));

export function flattenOrgs(nodes: unknown[]): OrgFlat[] {
  const out: OrgFlat[] = [];
  const walk = (items: unknown[], depth: number) => {
    for (const raw of items) {
      const node = raw as OrgNode;
      if (!node || typeof node.id !== "string") continue;
      out.push({ id: node.id, name: str(node.name, "未命名"), type: str(node.type, "department"), depth });
      if (Array.isArray(node.children) && node.children.length) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

export function orgName(orgs: OrgFlat[], id?: string | null): string {
  if (!id) return "—";
  return orgs.find((org) => org.id === id)?.name ?? "未命名部门";
}
