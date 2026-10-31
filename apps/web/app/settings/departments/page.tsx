"use client";

import { useState } from "react";
import { Building2, ChevronRight, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Avatar, Badge, Card, Empty, PageHeader, SearchBox } from "@/components/ui";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";
import { useData } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { avatarColor, cx, str } from "@/lib/utils";
import { roleLabel } from "@/lib/home";
import { useAuth } from "@/lib/auth";
import { flattenOrgs, ORG_TYPE_LABEL, type OrgNode } from "@/lib/org";
import { orgParentAllowed, orgTypes } from "../../../../../packages/shared/src/index";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  status: string;
  org_id: string | null;
  org_ids: string[];
  updated_at?: string;
};

type Editor = { mode: "create" | "edit"; id?: string; name: string; type: string; parent_id: string | null };

function normalizeUsers(items: unknown[]): UserRow[] {
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
      updated_at: str(x.updated_at) || undefined,
    };
  });
}

export default function DepartmentsPage() {
  const currentUser = useAuth((state) => state.user);
  const canStructure = currentUser?.role === "super_admin" || currentUser?.role === "center_director";
  const usersQuery = useData<unknown[]>("admin-users", "/admin/users");
  const orgQuery = useData<unknown[]>("org-tree", "/orgs/tree");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<UserRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const users = normalizeUsers(usersQuery.data ?? []);
  const orgs = flattenOrgs(orgQuery.data ?? []);
  const selected = orgs.find((org) => org.id === selectedId) ?? null;
  const members = selected ? users.filter((u) => u.org_ids.includes(selected.id)) : [];
  const candidates = selected
    ? users.filter((u) => !u.org_ids.includes(selected.id) && (!addQ.trim() || `${u.display_name}${u.username}`.toLowerCase().includes(addQ.trim().toLowerCase())))
    : [];

  const countOf = (id: string) => users.filter((u) => u.org_ids.includes(id)).length;
  const blockedParents = new Set<string>();
  const ownIndex = orgs.findIndex((org) => org.id === editor?.id);
  if (ownIndex >= 0) for (let i = ownIndex; i < orgs.length; i++) {
    if (i > ownIndex && orgs[i].depth <= orgs[ownIndex].depth) break;
    blockedParents.add(orgs[i].id);
  }

  const editorParentType = editor?.parent_id ? orgs.find((org) => org.id === editor.parent_id)?.type ?? null : null;
  const editorTypes: string[] = orgTypes.filter((type) => orgParentAllowed(type, editorParentType));
  if (editor && !editorTypes.includes(editor.type)) editorTypes.push(editor.type);

  const toggleExpand = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const openCreate = (parentId: string | null) => {
    const parentType = parentId ? orgs.find((org) => org.id === parentId)?.type ?? null : null;
    const nextType = orgTypes.find((type) => orgParentAllowed(type, parentType)) ?? "department";
    setEditor({ mode: "create", name: "", type: nextType, parent_id: parentId });
  };
  const openEdit = () => {
    if (!selected) return;
    setEditor({ mode: "edit", id: selected.id, name: selected.name, type: selected.type, parent_id: selected.parent_id });
  };

  const saveDept = async () => {
    if (!editor) return;
    if (!editor.name.trim()) return toast("请填写部门名称", "err");
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const created = await api<{ id?: string }>("/orgs", { method: "POST", body: JSON.stringify({ name: editor.name.trim(), type: editor.type, parent_id: editor.parent_id, enabled: true }) });
        if (created?.id) setSelectedId(created.id);
        toast("部门已创建");
      } else {
        await api(`/orgs/${encodeURIComponent(editor.id!)}`, { method: "PATCH", body: JSON.stringify({ name: editor.name.trim(), type: editor.type, ...(canStructure ? { parent_id: editor.parent_id } : {}) }) });
        toast("部门已更新");
      }
      await orgQuery.refetch();
      setEditor(null);
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const removeDept = async (id: string) => {
    const name = orgs.find((org) => org.id === id)?.name ?? "该部门";
    if (!window.confirm(`确认删除「${name}」？`)) return;
    setSaving(true);
    try {
      await api(`/orgs/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("部门已删除");
      setSelectedId(null);
      await orgQuery.refetch();
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? "该部门仍有子部门、人员、项目或任务关联，无法删除" : errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const setMemberships = async (user: UserRow, next: string[]) => {
    await api(`/admin/users/${encodeURIComponent(user.id)}/profile`, {
      method: "PATCH",
      body: JSON.stringify({ org_ids: next, updated_at: user.updated_at }),
    });
  };

  const addMembers = async () => {
    if (!selected || !picked.length) return;
    setSaving(true);
    let added = 0;
    try {
      for (const id of picked) {
        const user = users.find((u) => u.id === id);
        if (user) { await setMemberships(user, [...user.org_ids, selected.id]); added++; }
      }
      await usersQuery.refetch();
      toast(`已加入 ${added} 人`);
      setAdding(false);
      setPicked([]);
      setAddQ("");
    } catch (e) {
      await usersQuery.refetch();
      toast(`${added ? `已加入 ${added} 人；其余未完成：` : ""}${errorText(e)}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async () => {
    if (!removing || !selected) return;
    setSaving(true);
    try {
      await setMemberships(removing, removing.org_ids.filter((id) => id !== selected.id));
      await usersQuery.refetch();
      toast(`${removing.display_name} 已移出该部门`);
      setRemoving(null);
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  if (usersQuery.isError || orgQuery.isError) return <>
    <PageHeader title="部门管理" />
    <div role="alert" className="p-6 text-[12.5px] text-red">
      数据加载失败：{errorText(usersQuery.error || orgQuery.error)}
      <button onClick={() => { void usersQuery.refetch(); void orgQuery.refetch(); }} className="ml-2 underline">重试</button>
    </div>
  </>;

  return (
    <>
      <PageHeader
        title="部门管理"
        sub={`共 ${orgs.length} 个部门 · ${users.length} 人`}
        right={canStructure ? <button onClick={() => openCreate(null)} className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas"><Plus size={14} /> 新建部门</button> : undefined}
      />

      <div className="flex min-h-[520px] gap-3 p-6 pt-4">
        <Card className="flex w-[320px] shrink-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-fill px-3 py-2.5">
            <span className="text-[12px] font-semibold text-ink">部门结构</span>
            <span className="rounded-full bg-accent-soft px-1.5 text-[10.5px] font-medium leading-[17px] text-ink-3">{orgs.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {orgs.length === 0 && <Empty text={orgQuery.isPending ? "加载中…" : "暂无部门"} />}
            <OrgTree
              nodes={(orgQuery.data ?? []) as OrgNode[]}
              depth={0}
              selectedId={selected?.id ?? null}
              collapsed={collapsed}
              countOf={countOf}
              canStructure={canStructure}
              onSelect={setSelectedId}
              onToggle={toggleExpand}
              onAdd={(id) => openCreate(id)}
              onEdit={(id) => {
                const org = orgs.find((item) => item.id === id);
                if (org) setEditor({ mode: "edit", id: org.id, name: org.name, type: org.type, parent_id: org.parent_id });
              }}
              onDelete={(id) => void removeDept(id)}
            />
          </div>
        </Card>

        <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!selected ? (
            <Empty text="请选择左侧部门" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-fill px-4 py-2.5">
                <Building2 size={15} className="text-ink-3" />
                <span className="text-[13px] font-semibold text-ink">{selected.name}</span>
                <Badge color="var(--color-ink-3)">{ORG_TYPE_LABEL[selected.type] ?? selected.type}</Badge>
                <span className="text-[11.5px] text-ink-3">{members.length} 人</span>
                <span className="flex-1" />
                <button onClick={() => { setAdding(true); setPicked([]); setAddQ(""); }} className="flex h-7 items-center gap-1 rounded-sm border border-border bg-panel px-2.5 text-[12px] text-ink-2 hover:bg-fill"><UserPlus size={13} /> 添加成员</button>
                <button onClick={openEdit} className="flex h-7 items-center gap-1 rounded-sm border border-border bg-panel px-2.5 text-[12px] text-ink-2 hover:bg-fill"><Pencil size={12} /> 编辑</button>
                {canStructure && <button onClick={() => openCreate(selected.id)} className="flex h-7 items-center gap-1 rounded-sm border border-border bg-panel px-2.5 text-[12px] text-ink-2 hover:bg-fill"><Plus size={13} /> 子部门</button>}
                {canStructure && <button onClick={() => void removeDept(selected.id)} disabled={saving} className="flex h-7 items-center gap-1 rounded-sm border border-border bg-panel px-2.5 text-[12px] text-red hover:bg-fill"><Trash2 size={12} /> 删除</button>}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                      <th className="px-4 py-2.5 font-medium">成员</th>
                      <th className="w-[140px] px-3 py-2.5 font-medium">角色</th>
                      <th className="w-[120px] px-3 py-2.5 font-medium">账号状态</th>
                      <th className="w-[100px] px-4 py-2.5 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((user) => (
                      <tr key={user.id} className="border-b border-border/60 last:border-0 hover:bg-canvas">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={user.display_name} color={avatarColor(user.username)} size={28} />
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-medium">{user.display_name}</span>
                              <span className="block truncate text-[11px] text-ink-3">@{user.username}</span>
                            </span>
                            {user.org_id === selected.id && user.org_ids.length > 1 && <Badge color="var(--color-ink-3)">主部门</Badge>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">{roleLabel(user.role)}</td>
                        <td className="px-3 py-2.5"><Badge color={user.status === "active" ? "var(--color-green)" : "var(--color-ink-3)"}>{user.status === "active" ? "启用" : user.status === "locked" ? "已锁定" : "已停用"}</Badge></td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => setRemoving(user)} className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-red"><X size={12} /> 移出</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {members.length === 0 && <Empty text={usersQuery.isPending ? "加载中…" : "该部门下暂无人员"} />}
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        open={!!editor}
        title={editor?.mode === "edit" ? "编辑部门" : "新建部门"}
        onClose={() => setEditor(null)}
        footer={<>
          <button onClick={() => setEditor(null)} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void saveDept()} disabled={saving} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
        </>}
      >
        {editor && (
          <div className="flex flex-col gap-3">
            <Field label="部门名称">
              <input className={inputCls} value={editor.name} maxLength={128} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
            </Field>
            <Field label="组织类型">
              <select className={inputCls} value={editor.type} onChange={(e) => setEditor({ ...editor, type: e.target.value })}>
                {editorTypes.map((type) => <option key={type} value={type}>{ORG_TYPE_LABEL[type] ?? type}</option>)}
              </select>
            </Field>
            <Field label="上级组织">
              <select
                className={inputCls}
                disabled={!canStructure || editor.type === "company"}
                value={editor.parent_id ?? ""}
                onChange={(e) => {
                  const parentId = e.target.value || null;
                  const parentType = parentId ? orgs.find((org) => org.id === parentId)?.type ?? null : null;
                  const types: string[] = orgTypes.filter((type) => orgParentAllowed(type, parentType));
                  setEditor({ ...editor, parent_id: parentId, type: types.includes(editor.type) ? editor.type : types[0] ?? editor.type });
                }}
              >
                {orgParentAllowed(editor.type, null) && <option value="">无（顶级组织）</option>}
                {orgs.filter((org) => !blockedParents.has(org.id) && (orgParentAllowed(editor.type, org.type) || org.id === editor.parent_id)).map((org) => <option key={org.id} value={org.id}>{"　".repeat(org.depth)}{org.name}</option>)}
              </select>
            </Field>
            <p className="text-[11.5px] text-ink-3">组织层级固定为公司 &gt; 二级单位 &gt; 中心 &gt; 部门；创新工作室只能挂在中心或部门下。</p>
          </div>
        )}
      </Modal>

      <Modal
        open={adding}
        title="添加成员"
        onClose={() => setAdding(false)}
        footer={<>
          <button onClick={() => setAdding(false)} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void addMembers()} disabled={saving || !picked.length} className="h-8 rounded-sm bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-50">{saving ? "添加中…" : `添加${picked.length ? ` ${picked.length} 人` : ""}`}</button>
        </>}
      >
        <div className="flex flex-col gap-2.5">
          <SearchBox placeholder="搜索姓名 / 用户名" value={addQ} onChange={setAddQ} />
          <div className="max-h-64 overflow-y-auto rounded-sm border border-border">
            {candidates.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-fill">
                <input
                  type="checkbox"
                  className="accent-ink"
                  checked={picked.includes(user.id)}
                  onChange={() => setPicked((prev) => prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id])}
                />
                <Avatar name={user.display_name} color={avatarColor(user.username)} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink">{user.display_name}</span>
                  <span className="block truncate text-[11px] text-ink-3">@{user.username} · {roleLabel(user.role)}</span>
                </span>
              </label>
            ))}
            {candidates.length === 0 && <p className="px-3 py-5 text-center text-[12px] text-ink-3">{addQ ? "没有匹配的用户" : "所有用户都已在该部门"}</p>}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!removing}
        title="移出部门"
        onClose={() => setRemoving(null)}
        footer={<>
          <button onClick={() => setRemoving(null)} className="h-8 rounded-sm border border-border px-3 text-[12.5px] text-ink-2">取消</button>
          <button onClick={() => void removeMember()} disabled={saving} className="h-8 rounded-sm bg-red px-3 text-[12.5px] font-medium text-white disabled:opacity-50">{saving ? "处理中…" : "确认移出"}</button>
        </>}
      >
        <p className="text-[12.5px] text-ink-2">确认将 {removing?.display_name} 移出「{selected?.name}」？该用户的其他部门归属不受影响。</p>
      </Modal>
    </>
  );
}

function OrgTree({
  nodes, depth, selectedId, collapsed, countOf, canStructure, onSelect, onToggle, onAdd, onEdit, onDelete,
}: {
  nodes: OrgNode[]; depth: number; selectedId: string | null; collapsed: ReadonlySet<string>;
  countOf: (id: string) => number; canStructure: boolean;
  onSelect: (id: string) => void; onToggle: (id: string) => void;
  onAdd: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const children = Array.isArray(node.children) ? node.children : [];
        const open = children.length > 0 && !collapsed.has(node.id);
        const active = node.id === selectedId;
        return (
          <div key={node.id}>
            <div
              role="option"
              aria-selected={active}
              tabIndex={0}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => { if (e.key === "Enter") onSelect(node.id); }}
              className={cx(
                "group flex h-8 cursor-pointer items-center gap-1 border-b border-border/60 border-l-2 pr-1.5 text-[12.5px] transition-colors",
                active ? "border-l-ink bg-accent-soft" : "border-l-transparent hover:bg-fill",
              )}
              style={{ paddingLeft: 6 + depth * 14 }}
            >
              <button
                type="button"
                aria-label={`${open ? "收起" : "展开"} ${node.name}`}
                onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
                className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-ink-3 hover:bg-fill", !children.length && "invisible")}
              >
                <ChevronRight size={12} className={cx("transition-transform", open && "rotate-90")} />
              </button>
              <Building2 size={13} className="shrink-0 text-ink-3" />
              <span className={cx("min-w-0 flex-1 truncate", active ? "font-medium text-ink" : "text-ink-2")}>{node.name}</span>
              <span className="shrink-0 text-[11px] text-ink-3 group-hover:hidden">{countOf(node.id)}</span>
              <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                {canStructure && <button type="button" title="新建子部门" aria-label={`在 ${node.name} 下新建子部门`} onClick={(e) => { e.stopPropagation(); onAdd(node.id); }} className="flex h-5 w-5 items-center justify-center rounded-[3px] text-ink-3 hover:bg-panel hover:text-ink"><Plus size={12} /></button>}
                <button type="button" title="编辑部门" aria-label={`编辑 ${node.name}`} onClick={(e) => { e.stopPropagation(); onEdit(node.id); }} className="flex h-5 w-5 items-center justify-center rounded-[3px] text-ink-3 hover:bg-panel hover:text-ink"><Pencil size={11} /></button>
                {canStructure && <button type="button" title="删除部门" aria-label={`删除 ${node.name}`} onClick={(e) => { e.stopPropagation(); onDelete(node.id); }} className="flex h-5 w-5 items-center justify-center rounded-[3px] text-ink-3 hover:bg-panel hover:text-red"><Trash2 size={11} /></button>}
              </span>
            </div>
            {open && (
              <OrgTree nodes={children} depth={depth + 1} selectedId={selectedId} collapsed={collapsed} countOf={countOf} canStructure={canStructure} onSelect={onSelect} onToggle={onToggle} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
            )}
          </div>
        );
      })}
    </>
  );
}
