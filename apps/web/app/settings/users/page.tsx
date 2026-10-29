"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Avatar, Badge, Card, Empty, PageHeader, SearchBox } from "@/components/ui";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";
import { useData } from "@/lib/data";
import { api } from "@/lib/api";
import { avatarColor, cx, str } from "@/lib/utils";
import { roleLabel } from "@/lib/home";
import { flattenOrgs, orgName, ORG_TYPE_LABEL } from "@/lib/org";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  status: string;
  org_id: string | null;
  org_ids: string[];
  created_at?: string;
};

const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "启用", color: "var(--color-green)" },
  disabled: { label: "已停用", color: "var(--color-ink-3)" },
  locked: { label: "已锁定", color: "var(--color-red)" },
};

function normalize(items: unknown[]): UserRow[] {
  return items.map((raw) => {
    const x = raw as Record<string, unknown>;
    const orgIds = Array.isArray(x.org_ids) ? x.org_ids.filter((id): id is string => typeof id === "string") : [];
    const primary = str(x.org_id) || null;
    return {
      id: str(x.id),
      username: str(x.username),
      display_name: str(x.display_name, str(x.username)),
      role: str(x.role, "member"),
      status: str(x.status, "active"),
      org_id: primary,
      org_ids: orgIds.length ? orgIds : primary ? [primary] : [],
      created_at: str(x.created_at) || undefined,
    };
  });
}

export default function UsersPage() {
  const usersQuery = useData<unknown[]>("admin-users", "/admin/users");
  const orgQuery = useData<unknown[]>("org-tree", "/orgs/tree");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const users = normalize(usersQuery.data ?? []);
  const orgs = flattenOrgs(orgQuery.data ?? []);
  const selected = users.find((u) => u.id === selectedId) ?? null;
  const kw = q.trim().toLowerCase();
  const shown = users.filter((u) =>
    !kw || `${u.display_name}${u.username}${u.org_ids.map((id) => orgName(orgs, id)).join("")}`.toLowerCase().includes(kw));

  const open = (user: UserRow) => {
    setSelectedId(user.id);
    setName(user.display_name);
    setOrgIds(user.org_ids);
  };
  const close = () => setSelectedId(null);

  const toggleOrg = (id: string) => {
    setOrgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    if (!selected) return;
    if (!name.trim()) return toast("展示名称不能为空", "err");
    setSaving(true);
    try {
      await api(`/admin/users/${encodeURIComponent(selected.id)}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ display_name: name.trim(), org_ids: orgIds }),
      });
      await usersQuery.refetch();
      toast("已保存");
      close();
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const dirty = selected ? name.trim() !== selected.display_name || [...orgIds].sort().join("|") !== [...selected.org_ids].sort().join("|") : false;

  return (
    <>
      <PageHeader
        title="用户管理"
        sub={`共 ${users.length} 人${q ? `，匹配 ${shown.length} 人` : ""}`}
        right={<SearchBox placeholder="搜索姓名 / 用户名 / 部门" className="w-64" value={q} onChange={setQ} />}
      />

      <div className="p-6 pt-4">
        <Card className="overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">用户</th>
                <th className="px-3 py-2.5 font-medium">所属部门</th>
                <th className="w-[130px] px-3 py-2.5 font-medium">角色</th>
                <th className="w-[90px] px-3 py-2.5 font-medium">状态</th>
                <th className="w-[130px] px-5 py-2.5 font-medium">加入时间</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((user) => {
                const status = STATUS[user.status] ?? { label: user.status || "—", color: "var(--color-ink-3)" };
                return (
                  <tr
                    key={user.id}
                    onClick={() => open(user)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-canvas"
                  >
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={user.display_name} color={avatarColor(user.username)} size={30} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{user.display_name}</span>
                          <span className="block truncate text-[11.5px] text-ink-3">@{user.username}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {user.org_ids.length ? user.org_ids.map((id) => (
                          <Badge key={id} color="var(--color-ink)">
                            {orgName(orgs, id)}
                            {id === user.org_id && user.org_ids.length > 1 ? " · 主" : ""}
                          </Badge>
                        )) : <span className="text-ink-3">未分配部门</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{roleLabel(user.role)}</td>
                    <td className="px-3 py-3"><Badge color={status.color}>{status.label}</Badge></td>
                    <td className="px-5 py-3 text-[11.5px] text-ink-3">{user.created_at ? user.created_at.slice(0, 10) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {usersQuery.isPending && <Empty text="加载中…" />}
          {!usersQuery.isPending && usersQuery.isError && <Empty text={errorText(usersQuery.error)} />}
          {!usersQuery.isPending && !usersQuery.isError && shown.length === 0 && <Empty text={users.length ? "没有匹配的用户" : "暂无用户"} />}
        </Card>
      </div>

      <Modal
        open={!!selected}
        wide
        title="用户详情"
        onClose={close}
        footer={<>
          <button onClick={close} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void save()} disabled={saving || !dirty} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
        </>}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <Avatar name={selected.display_name} color={avatarColor(selected.username)} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{selected.display_name}</p>
                <p className="truncate text-[12px] text-ink-3">@{selected.username} · {roleLabel(selected.role)}</p>
              </div>
              <Badge color={(STATUS[selected.status] ?? { color: "var(--color-ink-3)" }).color}>
                {(STATUS[selected.status] ?? { label: selected.status }).label}
              </Badge>
            </div>

            <Field label="用户名">
              <input className={cx(inputCls, "bg-fill text-ink-3")} value={selected.username} disabled />
            </Field>

            <Field label="展示名称">
              <input className={inputCls} value={name} maxLength={128} onChange={(e) => setName(e.target.value)} />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-ink">所属部门</span>
              <p className="text-[11.5px] text-ink-3">可多选；列表中的第一个部门作为主部门。</p>
              <div className="max-h-56 overflow-y-auto rounded-sm border border-border">
                {orgs.length === 0 && <p className="px-3 py-4 text-[12px] text-ink-3">暂无可选部门</p>}
                {orgs.map((org) => (
                  <label
                    key={org.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-fill"
                    style={{ paddingLeft: 12 + org.depth * 16 }}
                  >
                    <input
                      type="checkbox"
                      className="accent-ink"
                      checked={orgIds.includes(org.id)}
                      onChange={() => toggleOrg(org.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{org.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{ORG_TYPE_LABEL[org.type] ?? org.type}</span>
                    {org.id === selected.org_id && orgIds.includes(org.id) && (
                      <span className="shrink-0 text-[11px] text-ink-3">主部门</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
              <ShieldCheck size={13} /> 角色与账号状态为只读字段，由系统管理员维护。
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
