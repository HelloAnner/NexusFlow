"use client";

import { useState } from "react";
import { Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Avatar, Badge, Card, Empty, PageHeader, SearchBox } from "@/components/ui";
import { Modal, Field, inputCls, toast, errorText } from "@/components/feedback";
import { useData } from "@/lib/data";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { avatarColor, cx, str } from "@/lib/utils";
import { roleLabel } from "@/lib/home";
import { flattenOrgs, orgName, ORG_TYPE_LABEL } from "@/lib/org";
import { dutyTags, managementLevels, professionalLevels, projectRoles, skillGroups, workStatuses } from "../../../../../packages/shared/src/index";

type Membership = { project_role?: string; responsibility?: string; start_date?: string; end_date?: string | null; active?: boolean };

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  status: string;
  org_id: string | null;
  org_ids: string[];
  created_at?: string;
  updated_at?: string;
  person_id?: string | null;
  title?: string | null;
  employee_no?: string | null;
  management_level?: string | null;
  professional_level?: string | null;
  duties: string[];
  skills: string[];
  studio_ids: string[];
  work_status: string;
  dispatchable: boolean;
  daily_standard_hours: number;
};

type ProjectRow = { id: string; name: string; member_ids: string[]; members: Record<string, Membership> };

type ProfileForm = {
  name: string;
  employeeNo: string;
  managementLevel: string;
  professionalLevel: string;
  duties: string[];
  skills: string[];
  studioIds: string[];
  workStatus: string;
  hours: number;
  dispatchable: boolean;
};

const EMPTY_FORM: ProfileForm = {
  name: "", employeeNo: "", managementLevel: "", professionalLevel: "",
  duties: [], skills: [], studioIds: [], workStatus: "active", hours: 8, dispatchable: true,
};

const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "启用", color: "var(--color-green)" },
  disabled: { label: "已停用", color: "var(--color-ink-3)" },
  locked: { label: "已锁定", color: "var(--color-red)" },
};

const labelOf = (list: readonly { value: string; label: string }[], value?: string | null) =>
  list.find((x) => x.value === value)?.label ?? (value || "—");
const strings = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
const sortedKey = (values: string[]) => [...values].sort().join("|");

function normalize(items: unknown[]): UserRow[] {
  return items.map((raw) => {
    const x = raw as Record<string, unknown>;
    const orgIds = strings(x.org_ids);
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
      updated_at: str(x.updated_at) || undefined,
      person_id: str(x.person_id) || null,
      title: str(x.title) || null,
      employee_no: str(x.employee_no) || null,
      management_level: str(x.management_level) || null,
      professional_level: str(x.professional_level) || null,
      duties: strings(x.duties),
      skills: strings(x.skills),
      studio_ids: strings(x.studio_ids),
      work_status: str(x.work_status, "active"),
      dispatchable: x.dispatchable !== false,
      daily_standard_hours: typeof x.daily_standard_hours === "number" ? x.daily_standard_hours : 8,
    };
  });
}

function normalizeProjects(items: unknown[]): ProjectRow[] {
  return items.map((raw) => {
    const x = raw as Record<string, unknown>;
    return {
      id: str(x.id),
      name: str(x.name, "未命名项目"),
      member_ids: strings(x.member_ids),
      members: x.members && typeof x.members === "object" ? x.members as Record<string, Membership> : {},
    };
  });
}

export default function UsersPage() {
  const usersQuery = useData<unknown[]>("admin-users", "/admin/users");
  const orgQuery = useData<unknown[]>("org-tree", "/orgs/tree");
  const projectsQuery = useData<unknown[]>("projects", "/projects");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [memberDraft, setMemberDraft] = useState({ project_id: "", project_role: "participant", responsibility: "", start_date: "", end_date: "" });
  const [editingProject, setEditingProject] = useState<string | null>(null);

  const users = normalize(usersQuery.data ?? []);
  const orgs = flattenOrgs(orgQuery.data ?? []);
  const studios = orgs.filter((org) => org.type === "studio");
  const projects = normalizeProjects(projectsQuery.data ?? []);
  const kw = q.trim().toLowerCase();
  const shown = users.filter((u) =>
    !kw || `${u.display_name}${u.username}${u.employee_no ?? ""}${u.org_ids.map((id) => orgName(orgs, id)).join("")}`.toLowerCase().includes(kw));

  const myProjects = selected
    ? projects.filter((p) => p.member_ids.includes(selected.id) || p.members[selected.id])
    : [];
  const selectableProjects = projects.filter((p) => editingProject === p.id || !p.member_ids.includes(selected?.id ?? ""));

  const open = (user: UserRow) => {
    setSelected(user);
    setForm({
      name: user.display_name,
      employeeNo: user.employee_no ?? "",
      managementLevel: user.management_level ?? "",
      professionalLevel: user.professional_level ?? "",
      duties: [...user.duties],
      skills: [...user.skills],
      studioIds: [...user.studio_ids],
      workStatus: user.work_status,
      hours: user.daily_standard_hours,
      dispatchable: user.dispatchable,
    });
    setOrgIds(user.org_ids);
    setEditingProject(null);
    setMemberDraft({ project_id: "", project_role: "participant", responsibility: "", start_date: "", end_date: "" });
  };
  const close = () => { if (!saving) setSelected(null); };

  const toggleOrg = (id: string) => {
    setOrgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleValue = (key: "duties" | "skills" | "studioIds", value: string) => {
    setForm((prev) => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter((x) => x !== value) : [...prev[key], value] }));
  };

  const departmentsChanged = selected ? sortedKey(orgIds) !== sortedKey(selected.org_ids) : false;
  const dirty = selected ? (
    form.name.trim() !== selected.display_name ||
    departmentsChanged ||
    form.employeeNo.trim() !== (selected.employee_no ?? "") ||
    form.managementLevel !== (selected.management_level ?? "") ||
    form.professionalLevel !== (selected.professional_level ?? "") ||
    form.workStatus !== selected.work_status ||
    form.hours !== selected.daily_standard_hours ||
    form.dispatchable !== selected.dispatchable ||
    sortedKey(form.duties) !== sortedKey(selected.duties) ||
    sortedKey(form.skills) !== sortedKey(selected.skills) ||
    sortedKey(form.studioIds) !== sortedKey(selected.studio_ids)
  ) : false;

  const save = async () => {
    if (!selected) return;
    if (!form.name.trim()) return toast("姓名不能为空", "err");
    if (!Number.isFinite(form.hours) || form.hours < 0 || form.hours > 24) return toast("日标准工时需在 0–24 之间", "err");
    setSaving(true);
    try {
      await api(`/admin/users/${encodeURIComponent(selected.id)}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          display_name: form.name.trim(),
          org_ids: orgIds,
          employee_no: form.employeeNo.trim() || null,
          management_level: form.managementLevel || null,
          professional_level: form.professionalLevel || null,
          duties: form.duties,
          skills: form.skills,
          studio_ids: form.studioIds,
          work_status: form.workStatus,
          daily_standard_hours: form.hours,
          dispatchable: form.dispatchable,
          updated_at: selected.updated_at,
        }),
      });
      await usersQuery.refetch();
      if (selected.id === useAuth.getState().user?.id) await useAuth.getState().fetchMe();
      toast("人员档案已保存");
      setSelected(null);
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const submitMembership = async () => {
    if (!selected) return;
    const projectId = editingProject ?? memberDraft.project_id;
    if (!projectId) return toast("请选择项目", "err");
    setSaving(true);
    try {
      await api(`/admin/users/${encodeURIComponent(selected.id)}/projects/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        body: JSON.stringify({
          project_role: memberDraft.project_role,
          responsibility: memberDraft.responsibility,
          start_date: memberDraft.start_date || undefined,
          end_date: memberDraft.end_date || null,
        }),
      });
      await projectsQuery.refetch();
      setEditingProject(null);
      setMemberDraft({ project_id: "", project_role: "participant", responsibility: "", start_date: "", end_date: "" });
      toast("项目归属已保存");
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const removeMembership = async (projectId: string, projectName: string) => {
    if (!selected || !window.confirm(`确认将「${selected.display_name}」移出项目「${projectName}」？`)) return;
    setSaving(true);
    try {
      await api(`/admin/users/${encodeURIComponent(selected.id)}/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
      await projectsQuery.refetch();
      toast("已移出项目，历史归属保留结束日期");
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const editMembership = (project: ProjectRow) => {
    const membership = project.members[selected?.id ?? ""] ?? {};
    setEditingProject(project.id);
    setMemberDraft({
      project_id: project.id,
      project_role: membership.project_role ?? "participant",
      responsibility: membership.responsibility ?? "",
      start_date: membership.start_date ?? "",
      end_date: membership.end_date ?? "",
    });
  };

  const unknownSkills = form.skills.filter((tag) => !skillGroups.some((group) => (group.tags as readonly string[]).includes(tag)));

  return (
    <>
      <PageHeader
        title="用户管理"
        sub={`共 ${users.length} 人${q ? `，匹配 ${shown.length} 人` : ""}`}
        right={<SearchBox placeholder="搜索姓名 / 用户名 / 工号 / 部门" className="w-72" value={q} onChange={setQ} />}
      />

      <div className="p-6 pt-4">
        <Card className="overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">用户</th>
                <th className="px-3 py-2.5 font-medium">所属部门</th>
                <th className="w-[130px] px-3 py-2.5 font-medium">角色</th>
                <th className="w-[130px] px-3 py-2.5 font-medium">等级</th>
                <th className="w-[130px] px-3 py-2.5 font-medium">状态</th>
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
                          <button type="button" onClick={(e) => { e.stopPropagation(); open(user); }} aria-label={`查看 ${user.display_name} 的详情`} className="block truncate rounded-sm text-left text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-ink">{user.display_name}</button>
                          <span className="block truncate text-[11.5px] text-ink-3">@{user.username}{user.employee_no ? ` · ${user.employee_no}` : ""}</span>
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
                    <td className="px-3 py-3 text-ink-2">{user.professional_level ? labelOf(professionalLevels, user.professional_level) : user.management_level ? labelOf(managementLevels, user.management_level) : "—"}</td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge color={status.color}>{status.label}</Badge>
                        {user.work_status !== "active" && <Badge color="var(--color-orange)">{labelOf(workStatuses, user.work_status)}</Badge>}
                        {!user.dispatchable && <Badge color="var(--color-red)">不可派发</Badge>}
                      </span>
                    </td>
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
        title="人员档案"
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

            <section className="flex flex-col gap-3">
              <h4 className="text-[12.5px] font-semibold text-ink">基础档案</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="姓名">
                  <input className={inputCls} value={form.name} maxLength={128} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </Field>
                <Field label="工号">
                  <input className={inputCls} value={form.employeeNo} maxLength={64} placeholder="唯一，可留空" onChange={(e) => setForm((p) => ({ ...p, employeeNo: e.target.value }))} />
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-ink">主组织 / 所属部门</span>
                <p className="text-[11.5px] text-ink-3">可多选；保留原主部门，移除后由剩余部门递补。</p>
                <div className="max-h-56 overflow-y-auto rounded-sm border border-border">
                  {orgQuery.isError && <p role="alert" className="px-3 py-4 text-[12px] text-red">部门加载失败，<button onClick={() => void orgQuery.refetch()} className="underline">重试</button></p>}
                  {!orgQuery.isError && orgs.length === 0 && <p className="px-3 py-4 text-[12px] text-ink-3">{orgQuery.isPending ? "加载中…" : "暂无可选部门"}</p>}
                  {orgs.map((org) => (
                    <label
                      key={org.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-fill"
                      style={{ paddingLeft: 12 + org.depth * 16 }}
                    >
                      <input type="checkbox" className="accent-ink" checked={orgIds.includes(org.id)} onChange={() => toggleOrg(org.id)} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{org.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-3">{ORG_TYPE_LABEL[org.type] ?? org.type}</span>
                      {org.id === selected.org_id && orgIds.includes(org.id) && <span className="shrink-0 text-[11px] text-ink-3">主部门</span>}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-ink">创新工作室</span>
                <div className="flex flex-wrap gap-1.5">
                  {studios.length === 0 && <span className="text-[11.5px] text-ink-3">尚未创建工作室组织，可在部门管理中新增。</span>}
                  {studios.map((studio) => (
                    <button key={studio.id} type="button" onClick={() => toggleValue("studioIds", studio.id)}
                      className={cx("h-7 rounded-full border px-2.5 text-[11.5px]", form.studioIds.includes(studio.id) ? "border-ink bg-ink text-canvas" : "border-border text-ink-2 hover:bg-fill")}>
                      {studio.name}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <h4 className="text-[12.5px] font-semibold text-ink">等级与职责</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="管理等级">
                  <select className={inputCls} value={form.managementLevel} onChange={(e) => setForm((p) => ({ ...p, managementLevel: e.target.value }))}>
                    <option value="">未设置</option>
                    {managementLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                  </select>
                </Field>
                <Field label="专业等级">
                  <select className={inputCls} value={form.professionalLevel} onChange={(e) => setForm((p) => ({ ...p, professionalLevel: e.target.value }))}>
                    <option value="">未设置</option>
                    {professionalLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-ink">职责分类</span>
                <div className="flex flex-wrap gap-1.5">
                  {dutyTags.map((duty) => (
                    <button key={duty.value} type="button" onClick={() => toggleValue("duties", duty.value)}
                      className={cx("h-7 rounded-full border px-2.5 text-[11.5px]", form.duties.includes(duty.value) ? "border-ink bg-ink text-canvas" : "border-border text-ink-2 hover:bg-fill")}>
                      {duty.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <h4 className="text-[12.5px] font-semibold text-ink">技能标签</h4>
              {skillGroups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] text-ink-3">{group.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(group.tags as readonly string[]).map((tag) => (
                      <button key={tag} type="button" onClick={() => toggleValue("skills", tag)}
                        className={cx("h-7 rounded-full border px-2.5 text-[11.5px]", form.skills.includes(tag) ? "border-ink bg-ink text-canvas" : "border-border text-ink-2 hover:bg-fill")}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {unknownSkills.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] text-ink-3">已有自定义标签</span>
                  <div className="flex flex-wrap gap-1.5">
                    {unknownSkills.map((tag) => (
                      <button key={tag} type="button" onClick={() => toggleValue("skills", tag)}
                        className="h-7 rounded-full border border-ink bg-ink px-2.5 text-[11.5px] text-canvas">
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <h4 className="text-[12.5px] font-semibold text-ink">工作状态</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="状态">
                  <select className={inputCls} value={form.workStatus} onChange={(e) => setForm((p) => ({ ...p, workStatus: e.target.value }))}>
                    {workStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </Field>
                <Field label="日标准工时">
                  <input type="number" min={0} max={24} step={0.5} className={inputCls} value={form.hours}
                    onChange={(e) => setForm((p) => ({ ...p, hours: Number(e.target.value) }))} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" className="accent-ink" checked={form.dispatchable} onChange={(e) => setForm((p) => ({ ...p, dispatchable: e.target.checked }))} />
                可被派发新任务
              </label>
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[12.5px] font-semibold text-ink">项目归属</h4>
                <span className="text-[11.5px] text-ink-3">项目身份与负责工作，不等同于任务成员</span>
              </div>
              {myProjects.length === 0 && <p className="text-[11.5px] text-ink-3">尚未加入任何项目。</p>}
              <div className="flex flex-col gap-2">
                {myProjects.map((project) => {
                  const membership = project.members[selected.id] ?? {};
                  return (
                    <div key={project.id} className="flex items-start justify-between gap-3 rounded-sm border border-border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink">{project.name}</p>
                        <p className="text-[11.5px] text-ink-3">
                          {labelOf(projectRoles, membership.project_role)}
                          {membership.responsibility ? ` · ${membership.responsibility}` : ""}
                          {membership.start_date ? ` · ${membership.start_date} 起` : ""}
                          {membership.active === false ? " · 已退出" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" aria-label="编辑项目归属" onClick={() => editMembership(project)} className="rounded-sm p-1 text-ink-3 hover:bg-fill hover:text-ink"><Pencil size={13} /></button>
                        <button type="button" aria-label="移出项目" onClick={() => void removeMembership(project.id, project.name)} className="rounded-sm p-1 text-ink-3 hover:bg-fill hover:text-red"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-sm border border-border bg-fill/40 p-3">
                <p className="mb-2 text-[11.5px] font-medium text-ink-2">{editingProject ? "修改项目归属" : "添加项目归属"}</p>
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputCls} value={editingProject ?? memberDraft.project_id} disabled={!!editingProject}
                    onChange={(e) => setMemberDraft((p) => ({ ...p, project_id: e.target.value }))}>
                    <option value="">选择项目</option>
                    {selectableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <select className={inputCls} value={memberDraft.project_role} onChange={(e) => setMemberDraft((p) => ({ ...p, project_role: e.target.value }))}>
                    {projectRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  <input className={inputCls} placeholder="负责工作" maxLength={200} value={memberDraft.responsibility}
                    onChange={(e) => setMemberDraft((p) => ({ ...p, responsibility: e.target.value }))} />
                  <input type="date" className={inputCls} value={memberDraft.start_date}
                    onChange={(e) => setMemberDraft((p) => ({ ...p, start_date: e.target.value }))} />
                  <input type="date" className={inputCls} value={memberDraft.end_date}
                    onChange={(e) => setMemberDraft((p) => ({ ...p, end_date: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void submitMembership()} disabled={saving}
                      className="h-8 flex-1 rounded-sm bg-ink px-3 text-[12px] font-medium text-canvas disabled:opacity-50">
                      {editingProject ? "保存归属" : "添加"}
                    </button>
                    {editingProject && (
                      <button type="button" className="h-8 rounded-sm border border-border px-2 text-[12px] text-ink-2"
                        onClick={() => { setEditingProject(null); setMemberDraft({ project_id: "", project_role: "participant", responsibility: "", start_date: "", end_date: "" }); }}>取消</button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-ink-3">开始日期默认为今天；结束日期留空表示当前有效。</p>
              </div>
            </section>

            <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
              <ShieldCheck size={13} /> 账号角色与账号状态仍由系统管理员在权限/账号流程中维护；此处维护人员档案。
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
