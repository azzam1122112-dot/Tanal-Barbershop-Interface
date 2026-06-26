"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type AdminRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
};

export function PlatformAdmins({ initialAdmins, currentAdminId }: { initialAdmins: AdminRow[]; currentAdminId: string }) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, setPending] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const response = await fetch("/api/platform/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }),
    });
    const data = (await response.json().catch(() => ({}))) as { admin?: AdminRow; message?: string };
    if (response.ok && data.admin) {
      setAdmins((current) => [...current, { ...data.admin!, lastLoginAt: null }]);
      formEl.reset();
      setToast({ message: "تم إنشاء المدير", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء المدير", tone: "error" });
    }
    setPending(false);
  }

  async function toggleActive(admin: AdminRow) {
    const response = await fetch(`/api/platform/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !admin.isActive }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (response.ok) {
      setAdmins((current) => current.map((item) => (item.id === admin.id ? { ...item, isActive: !item.isActive } : item)));
      setToast({ message: "تم تحديث المدير", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث المدير", tone: "error" });
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const response = await fetch("/api/platform/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (response.ok) {
      formEl.reset();
      setToast({ message: "تم تغيير كلمة المرور", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تغيير كلمة المرور", tone: "error" });
    }
    setSavingPassword(false);
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <div className="space-y-6">
        <form onSubmit={createAdmin} className="dashboard-panel space-y-3 p-5">
          <h2 className="text-lg font-bold tracking-tight">إضافة مدير منصّة</h2>
          <label className="block text-sm font-semibold">الاسم<input name="name" required className="dashboard-field mt-2" /></label>
          <label className="block text-sm font-semibold">البريد الإلكتروني<input name="email" type="email" required dir="ltr" className="dashboard-field mt-2" /></label>
          <label className="block text-sm font-semibold">كلمة المرور<input name="password" type="password" required autoComplete="new-password" className="dashboard-field mt-2" /></label>
          <button disabled={pending} aria-busy={pending} className="dashboard-button-gold w-full">{pending ? "جاري الإضافة..." : "إضافة المدير"}</button>
        </form>

        <form onSubmit={changePassword} className="dashboard-panel space-y-3 p-5">
          <h2 className="text-lg font-bold tracking-tight">تغيير كلمة مروري</h2>
          <label className="block text-sm font-semibold">كلمة المرور الحالية<input name="currentPassword" type="password" required autoComplete="current-password" className="dashboard-field mt-2" /></label>
          <label className="block text-sm font-semibold">كلمة المرور الجديدة<input name="newPassword" type="password" required autoComplete="new-password" className="dashboard-field mt-2" /></label>
          <button disabled={savingPassword} aria-busy={savingPassword} className="dashboard-button w-full">{savingPassword ? "جاري الحفظ..." : "تحديث كلمة المرور"}</button>
        </form>
      </div>

      <div className="dashboard-panel overflow-x-auto">
        <table className="dashboard-table min-w-[560px]">
          <thead>
            <tr>
              <th>المدير</th>
              <th>آخر دخول</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id}>
                <td>
                  <p className="font-bold text-salon-ink">{admin.name} {admin.id === currentAdminId ? <span className="text-xs font-semibold text-salon-gold">(أنت)</span> : null}</p>
                  <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{admin.email}</p>
                </td>
                <td className="text-xs text-salon-charcoal/70">{admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString("ar-SA") : "—"}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggleActive(admin)}
                    disabled={admin.id === currentAdminId}
                    className={`rounded-lg px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${admin.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                  >
                    {admin.isActive ? "فعّال" : "معطّل"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
