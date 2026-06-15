"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import type { SafeAdminUser } from "@/lib/auth/sanitize";

type StaffResponse = {
  user?: SafeAdminUser;
  users?: SafeAdminUser[];
  message?: string;
};

type StaffDraft = {
  name: string;
  email: string;
  phone: string;
  role: "ADMIN" | "SUPERVISOR";
  isActive: boolean;
  password: string;
};

type StaffFilter = "all" | "ADMIN" | "SUPERVISOR" | "inactive";

const dateFormatter = new Intl.DateTimeFormat("ar-SA", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function StaffManager({ initialUsers, currentUserId }: { initialUsers: SafeAdminUser[]; currentUserId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, StaffDraft>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StaffFilter>("all");

  const adminCount = users.filter((user) => user.role === "ADMIN" && user.isActive).length;
  const supervisorCount = users.filter((user) => user.role === "SUPERVISOR" && user.isActive).length;
  const inactiveCount = users.filter((user) => !user.isActive).length;

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "inactive" ? !user.isActive : user.role === filter && user.isActive);
      const matchesQuery =
        normalizedQuery.length === 0 ||
        user.name.toLowerCase().includes(normalizedQuery) ||
        (user.email ?? "").toLowerCase().includes(normalizedQuery) ||
        (user.phone ?? "").includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [users, filter, query]);

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const response = await fetch("/api/dashboard/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone"),
        password: form.get("password"),
        role: form.get("role"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as StaffResponse;

    if (response.ok && data.user) {
      setUsers((current) => [data.user!, ...current]);
      formElement.reset();
      setToast({ message: "تم إنشاء حساب الموظف", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء حساب الموظف", tone: "error" });
    }

    setLoading(false);
  }

  function startEdit(user: SafeAdminUser) {
    setEditingId(user.id);
    setDrafts((current) => ({
      ...current,
      [user.id]: {
        name: user.name,
        email: user.email ?? "",
        phone: user.phone ?? "",
        role: user.role,
        isActive: Boolean(user.isActive),
        password: "",
      },
    }));
  }

  function updateDraft(id: string, patch: Partial<StaffDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  function cancelEdit(id: string) {
    setEditingId(null);
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function patchStaff(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/dashboard/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as StaffResponse;

    if (response.ok && data.user) {
      setUsers((current) => current.map((user) => (user.id === id ? data.user! : user)));
      return true;
    }

    setToast({ message: data.message ?? "تعذر تحديث الموظف", tone: "error" });
    return false;
  }

  async function saveStaff(user: SafeAdminUser) {
    const draft = drafts[user.id];
    if (!draft) return;

    const body: Record<string, unknown> = {};
    if (draft.name.trim() !== user.name) body.name = draft.name;
    if (draft.email.trim() !== (user.email ?? "")) body.email = draft.email;
    if (draft.phone.trim() !== (user.phone ?? "")) body.phone = draft.phone;
    if (draft.role !== user.role) body.role = draft.role;
    if (draft.isActive !== Boolean(user.isActive)) body.isActive = draft.isActive;
    if (draft.password.trim()) body.password = draft.password;

    if (Object.keys(body).length === 0) {
      cancelEdit(user.id);
      setToast({ message: "لا توجد تغييرات للحفظ", tone: "info" });
      return;
    }

    setPendingId(user.id);
    setToast(null);
    const ok = await patchStaff(user.id, body);
    if (ok) {
      cancelEdit(user.id);
      setToast({ message: "تم حفظ بيانات الموظف", tone: "success" });
    }
    setPendingId(null);
  }

  async function toggleStatus(user: SafeAdminUser) {
    setPendingId(user.id);
    setToast(null);
    await patchStaff(user.id, { isActive: !user.isActive });
    setPendingId(null);
  }

  return (
    <div className="mt-8 space-y-6">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryTile label="مدراء نشطون" value={adminCount} tone="ink" />
        <SummaryTile label="مشرفون نشطون" value={supervisorCount} tone="forest" />
        <SummaryTile label="حسابات معطلة" value={inactiveCount} tone="ruby" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <form onSubmit={createStaff} className="dashboard-panel h-fit overflow-hidden">
          <div className="border-b border-salon-line bg-salon-ink px-5 py-4 text-white">
            <p className="text-xs font-black text-salon-gold">حساب إدارة جديد</p>
            <h2 className="mt-2 text-2xl font-black">إضافة موظف</h2>
          </div>
          <div className="space-y-4 p-5">
            <Field label="اسم الموظف">
              <input name="name" required placeholder="مثال: محمد العتيبي" className="dashboard-field" />
            </Field>
            <Field label="البريد الإلكتروني">
              <input name="email" type="email" required placeholder="name@tanal.local" className="dashboard-field" />
            </Field>
            <Field label="رقم الجوال">
              <input name="phone" required inputMode="tel" placeholder="9665xxxxxxxx" className="dashboard-field" />
            </Field>
            <Field label="الصلاحية">
              <select name="role" defaultValue="SUPERVISOR" className="dashboard-field">
                <option value="SUPERVISOR">مشرف</option>
                <option value="ADMIN">مدير النظام</option>
              </select>
            </Field>
            <Field label="كلمة المرور">
              <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="8 أحرف على الأقل" className="dashboard-field" />
            </Field>
            <button disabled={loading} className="dashboard-button w-full">
              {loading ? "جاري الحفظ..." : "حفظ الموظف"}
            </button>
          </div>
        </form>

        <div className="dashboard-panel overflow-hidden">
          <div className="border-b border-salon-line px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black text-salon-gold">الصلاحيات</p>
                <h2 className="mt-2 text-2xl font-black">مدراء النظام والمشرفون</h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="بحث بالاسم أو البريد"
                  className="dashboard-field py-2.5"
                />
                <div className="grid grid-cols-4 rounded-lg border border-salon-line bg-white p-1 text-xs font-black">
                  {[
                    ["all", "الكل"],
                    ["ADMIN", "مدير"],
                    ["SUPERVISOR", "مشرف"],
                    ["inactive", "معطل"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value as StaffFilter)}
                      className={`rounded-md px-2 py-2 transition ${filter === value ? "bg-salon-ink text-white" : "text-salon-charcoal hover:bg-salon-pearl"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="divide-y divide-salon-line">
            {filteredUsers.map((user) => {
              const isEditing = editingId === user.id;
              const draft = drafts[user.id];
              const isPending = pendingId === user.id;
              const isCurrentUser = user.id === currentUserId;

              return (
                <article key={user.id} className="grid gap-4 px-5 py-5 xl:grid-cols-[1fr_180px_260px] xl:items-start">
                  <div className="min-w-0">
                    {isEditing && draft ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="اسم الموظف">
                          <input value={draft.name} onChange={(event) => updateDraft(user.id, { name: event.target.value })} className="dashboard-field py-2.5" />
                        </Field>
                        <Field label="البريد الإلكتروني">
                          <input value={draft.email} onChange={(event) => updateDraft(user.id, { email: event.target.value })} type="email" className="dashboard-field py-2.5" />
                        </Field>
                        <Field label="رقم الجوال">
                          <input value={draft.phone} onChange={(event) => updateDraft(user.id, { phone: event.target.value })} inputMode="tel" className="dashboard-field py-2.5" />
                        </Field>
                        <Field label="الصلاحية">
                          <select
                            value={draft.role}
                            onChange={(event) => updateDraft(user.id, { role: event.target.value as StaffDraft["role"] })}
                            disabled={isCurrentUser}
                            className="dashboard-field py-2.5 disabled:bg-salon-mist"
                          >
                            <option value="ADMIN">مدير النظام</option>
                            <option value="SUPERVISOR">مشرف</option>
                          </select>
                        </Field>
                        <Field label="كلمة مرور جديدة">
                          <input
                            value={draft.password}
                            onChange={(event) => updateDraft(user.id, { password: event.target.value })}
                            type="password"
                            minLength={8}
                            autoComplete="new-password"
                            placeholder="اتركها فارغة إذا لم تتغير"
                            className="dashboard-field py-2.5"
                          />
                        </Field>
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-salon-line bg-salon-pearl px-3 py-2.5">
                          <span className="text-sm font-black text-salon-charcoal">الحساب نشط</span>
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            disabled={isCurrentUser}
                            onChange={(event) => updateDraft(user.id, { isActive: event.target.checked })}
                            className="h-5 w-5 accent-salon-forest disabled:opacity-50"
                          />
                        </label>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-black">{user.name}</h3>
                          {isCurrentUser ? <span className="rounded-full bg-salon-gold/15 px-3 py-1 text-xs font-black text-salon-gold">حسابك</span> : null}
                          <RoleBadge role={user.role} />
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${user.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {user.isActive ? "نشط" : "معطل"}
                          </span>
                        </div>
                        <dl className="mt-3 grid gap-2 text-sm font-bold text-salon-charcoal md:grid-cols-2">
                          <Info label="البريد الإلكتروني" value={user.email ?? "-"} />
                          <Info label="رقم الجوال" value={user.phone ?? "-"} />
                          <Info label="آخر دخول" value={user.lastLoginAt ? dateFormatter.format(new Date(user.lastLoginAt)) : "لم يسجل دخولًا"} />
                          <Info label="آخر تحديث" value={user.updatedAt ? dateFormatter.format(new Date(user.updatedAt)) : "-"} />
                        </dl>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-salon-line bg-salon-pearl px-4 py-3">
                    <p className="text-xs font-black text-salon-charcoal">صلاحية الوصول</p>
                    <p className="mt-2 text-sm font-bold text-salon-charcoal/75">
                      {user.role === "ADMIN" ? "مدير كامل الصلاحيات" : "مشرف يدخل اللوحة ولا يدير الموظفين"}
                    </p>
                    <button
                      type="button"
                      disabled={isPending || isEditing || isCurrentUser}
                      onClick={() => void toggleStatus(user)}
                      className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${
                        user.isActive ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-red-50 text-red-700 hover:bg-red-100"
                      }`}
                    >
                      {user.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    {isEditing ? (
                      <>
                        <button type="button" disabled={isPending} onClick={() => void saveStaff(user)} className="dashboard-button py-2.5">
                          {isPending ? "جاري الحفظ..." : "حفظ"}
                        </button>
                        <button type="button" disabled={isPending} onClick={() => cancelEdit(user.id)} className="dashboard-button-soft py-2.5">
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={Boolean(editingId) || isPending} onClick={() => startEdit(user)} className="dashboard-button py-2.5">
                        تعديل
                      </button>
                    )}
                  </div>
                </article>
              );
            })}

            {filteredUsers.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-lg font-black">لا توجد نتائج مطابقة</p>
                <p className="dashboard-muted mt-2">غيّر البحث أو الفلتر لعرض الموظفين.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black text-salon-charcoal">{label}</span>
      {children}
    </label>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "ink" | "forest" | "ruby" }) {
  const toneClass = {
    ink: "text-salon-ink",
    forest: "text-salon-forest",
    ruby: "text-salon-ruby",
  }[tone];

  return (
    <div className="dashboard-soft-panel p-4">
      <p className="text-xs font-black text-salon-charcoal">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: "ADMIN" | "SUPERVISOR" }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${role === "ADMIN" ? "bg-salon-ink text-white" : "bg-salon-steel/10 text-salon-steel"}`}>
      {role === "ADMIN" ? "مدير النظام" : "مشرف"}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black text-salon-charcoal/70">{label}</dt>
      <dd className="mt-1 break-words text-salon-ink">{value}</dd>
    </div>
  );
}
