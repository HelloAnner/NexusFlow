"use client";

import React, { useState } from "react";
import { UserRound, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/home";
import { Card, PageHeader } from "@/components/ui";
import { Field, inputCls, toast, errorText } from "@/components/feedback";

export default function ProfilePage() {
  const { user, fetchMe, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  React.useEffect(() => setName(user?.name || ""), [user?.name]);
  const [saving, setSaving] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);

  const saveName = async () => {
    if (!name.trim()) return toast("显示名不能为空", "err");
    setSaving(true);
    try {
      await api("/auth/me", { method: "PATCH", body: JSON.stringify({ display_name: name.trim() }) });
      await fetchMe();
      toast("个人资料已更新");
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const changePwd = async () => {
    if (newPassword.length < 12) return toast("新密码至少 12 位", "err");
    if (newPassword !== confirm) return toast("两次输入的新密码不一致", "err");
    setChanging(true);
    try {
      await api("/auth/password", { method: "POST", body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) });
      toast("密码已修改，请重新登录");
      setTimeout(() => void logout(), 600);
    } catch (e) {
      toast(errorText(e), "err");
      setChanging(false);
    }
  };

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><UserRound size={17} />个人设置</span>}
        sub="更新显示名与登录密码；显示名会同步到团队与负载视图"
      />
      <div className="flex max-w-[640px] flex-col gap-4 px-6 py-4">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-[13.5px] font-semibold text-ink">个人信息</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="登录名"><input className={inputCls} value={user?.username || ""} disabled /></Field>
            <Field label="角色"><input className={inputCls} value={roleLabel(user?.role)} disabled /></Field>
          </div>
          <Field label="显示名">
            <input className={inputCls} value={name} maxLength={128} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveName()}
              className="h-8 rounded-[6px] bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink"><Shield size={14} />安全设置</h2>
          <Field label="当前密码">
            <input type="password" className={inputCls} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="新密码（至少 12 位）">
              <input type="password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="确认新密码">
              <input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <div>
            <button
              type="button"
              disabled={changing}
              onClick={() => void changePwd()}
              className="h-8 rounded-[6px] bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-50"
            >
              {changing ? "修改中…" : "修改密码"}
            </button>
          </div>
          <p className="text-[11.5px] text-ink-3">修改成功后所有会话都会失效，需要重新登录。</p>
        </Card>
      </div>
    </>
  );
}
