import type { Client } from "./client";
import type { CliArgs } from "./args";
import { option } from "./args";

type Subject = { id: string; username: string; name: string; role: string; status: string; managed?: boolean };
type Cell = { type: string; id: string; action: string; allow: boolean; source: string };
type Gate = { type: string; id?: string; action: string; allow: boolean };

function required(args: CliArgs, name: string): string {
  const value = option(args, name);
  if (!value) throw Error(`--${name} is required`);
  return value;
}

async function subjects(client: Client): Promise<Subject[]> {
  return (await client.json("/api/v1/rbac/subjects")).items as Subject[];
}

async function subject(client: Client, value: string): Promise<Subject> {
  const found = (await subjects(client)).find(
    (item) => item.id === value || item.username === value || item.name === value,
  );
  if (!found) throw Error(`member not found: ${value}`);
  return found;
}

const SOURCE: Record<string, string> = { role: "角色默认", allow: "个人允许", deny: "个人拒绝" };

export async function permCommand(client: Client, args: CliArgs): Promise<unknown> {
  const action = args.action || "catalog";
  if (action === "catalog") return client.json("/api/v1/rbac/catalog");
  if (action === "subjects") return client.json("/api/v1/rbac/subjects");
  if (action === "prune") {
    const dry = option(args, "dry-run") || args.options["dry-run"] === true;
    return client.json(`/api/v1/rbac/prune?dry_run=${dry ? "true" : "false"}`, "POST", {});
  }
  const target = await subject(client, required(args, "user"));
  if (action === "matrix") {
    return client.json(`/api/v1/rbac/matrix?subject_id=${encodeURIComponent(target.id)}`);
  }
  if (action === "set") {
    const effect = option(args, "effect");
    if (!["allow", "deny", "reset"].includes(effect)) throw Error("--effect must be allow|deny|reset");
    const body = {
      subject_id: target.id,
      type: required(args, "type"),
      id: required(args, "id"),
      action: required(args, "action"),
      effect: effect === "reset" ? null : effect,
    };
    return client.json("/api/v1/rbac/matrix", "PUT", body);
  }
  if (action === "reset") {
    return client.json(`/api/v1/rbac/matrix?subject_id=${encodeURIComponent(target.id)}`, "DELETE");
  }
  if (action === "check") {
    const matrix = await client.json(`/api/v1/rbac/matrix?subject_id=${encodeURIComponent(target.id)}`) as { cells: Cell[]; gates?: Gate[] };
    const type = required(args, "type");
    const id = required(args, "id");
    const act = required(args, "action");
    const cell = matrix.cells.find((item) => item.type === type && item.id === id && item.action === act);
    const gate = matrix.gates?.find((item) => item.type === type && (item.id === undefined || item.id === id) && item.action === act);
    const result = {
      subject: target.username, type, id, action: act,
      allow: Boolean(cell?.allow), source: cell?.source ?? "role", gate: gate?.allow ?? true,
    };
    if (!result.allow) process.exitCode = 1;
    return result;
  }
  throw Error(`unknown perm command: ${action}`);
}

export function permText(value: unknown, action: string): string {
  if (action === "catalog" && value && typeof value === "object") {
    const entities = (value as { entities?: Array<{ type: string; id: string; label: string; actions: string[] }> }).entities ?? [];
    return entities.map((item) => `${item.type}\t${item.id}\t${item.label}\t${item.actions.join(",")}`).join("\n");
  }
  if (action === "subjects" && value && typeof value === "object") {
    const items = (value as { items?: Subject[] }).items ?? [];
    return items.map((item) => `${item.id}\t${item.username}\t${item.name}\t${item.role}\t${item.managed === false ? "仅本系统" : "已映射"}`).join("\n");
  }
  if (action === "matrix" && value && typeof value === "object") {
    const matrix = value as { cells: Cell[]; baseline_label: string };
    return matrix.cells.map((cell) => `${cell.type}\t${cell.id}\t${cell.action}\t${cell.allow ? "开" : "关"}\t${SOURCE[cell.source] ?? cell.source}`).join("\n")
      + `\n${matrix.baseline_label}`;
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
