"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { SafeBarber } from "@/lib/auth/sanitize";
import { InlineEmpty } from "@/components/dashboard/ui";

type BarberResponse = {
  barber?: SafeBarber;
  barbers?: SafeBarber[];
  message?: string;
};

type SalonOption = { id: string; name: string };

type BarberDraft = {
  name: string;
  phone: string;
  pin: string;
  isActive: boolean;
  salonId: string;
  /** فارغ = استخدم النسبة الافتراضية للفرع. */
  commissionRate: string;
};

type BarberFilter = "all" | "active" | "inactive";

const dateFormatter = new Intl.DateTimeFormat("ar-SA", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function BarberManager({
  initialBarbers,
  salons,
  defaultSalonId,
  mode = "full",
}: {
  initialBarbers: SafeBarber[];
  salons: SalonOption[];
  defaultSalonId: string | null;
  /** `full` = مالك/مدير (إضافة وتعديل وحذف). `transfer` = مشرف (نقل بين فروعه فقط). */
  mode?: "full" | "transfer";
}) {
  const canManage = mode === "full";
  const [barbers, setBarbers] = useState(initialBarbers);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const salonName = (id: string | null | undefined) => salons.find((salon) => salon.id === id)?.name ?? "فرع محذوف";
  const hasMultipleSalons = salons.length > 1;
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, BarberDraft>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BarberFilter>("all");

  const activeCount = barbers.filter((barber) => barber.isActive).length;
  const inactiveCount = barbers.length - activeCount;

  const filteredBarbers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return barbers.filter((barber) => {
      const matchesFilter = filter === "all" || (filter === "active" ? barber.isActive : !barber.isActive);
      const matchesQuery =
        normalizedQuery.length === 0 ||
        barber.name.toLowerCase().includes(normalizedQuery) ||
        barber.phone.includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [barbers, filter, query]);

  async function createBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const response = await fetch("/api/dashboard/barbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        pin: form.get("pin"),
        salonId: form.get("salonId"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok && data.barber) {
      setBarbers((current) => [data.barber!, ...current]);
      formElement.reset();
      setToast({ message: "تم إضافة الحلاق بنجاح", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر حفظ الحلاق", tone: "error" });
    }
    setLoading(false);
  }

  function sanitizePhone(value: string) {
    return value.replace(/\D/g, "").slice(0, 10);
  }

  function startEdit(barber: SafeBarber) {
    setEditingId(barber.id);
    setDrafts((current) => ({
      ...current,
      [barber.id]: {
        name: barber.name,
        phone: barber.phone,
        pin: "",
        isActive: Boolean(barber.isActive),
        salonId: barber.salonId ?? "",
        commissionRate: barber.commissionRate == null ? "" : String(barber.commissionRate),
      },
    }));
  }

  function updateDraft(id: string, patch: Partial<BarberDraft>) {
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

  async function patchBarber(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/dashboard/barbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok && data.barber) {
      setBarbers((current) => current.map((barber) => (barber.id === id ? data.barber! : barber)));
      return { ok: true, barber: data.barber };
    }

    setToast({ message: data.message ?? "تعذر تحديث الحلاق", tone: "error" });
    return { ok: false };
  }

  async function resetPin(id: string, pin: string) {
    const response = await fetch(`/api/dashboard/barbers/${id}/reset-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok && data.barber) {
      setBarbers((current) => current.map((barber) => (barber.id === id ? data.barber! : barber)));
      return true;
    }

    setToast({ message: data.message ?? "تعذر تعيين الرمز", tone: "error" });
    return false;
  }

  async function saveBarber(barber: SafeBarber) {
    const draft = drafts[barber.id];
    if (!draft) return;

    setPendingId(barber.id);
    setToast(null);

    const updateBody: Record<string, unknown> = {};
    if (draft.name.trim() !== barber.name) updateBody.name = draft.name;
    if (draft.phone.trim() !== barber.phone) updateBody.phone = draft.phone;
    if (draft.isActive !== Boolean(barber.isActive)) updateBody.isActive = draft.isActive;
    if (draft.salonId && draft.salonId !== (barber.salonId ?? "")) updateBody.salonId = draft.salonId;
    const draftRate = draft.commissionRate.trim();
    const currentRate = barber.commissionRate == null ? "" : String(barber.commissionRate);
    if (draftRate !== currentRate) updateBody.commissionRate = draftRate === "" ? null : Number(draftRate);

    const detailsChanged = Object.keys(updateBody).length > 0;
    const pinChanged = draft.pin.trim().length > 0;

    if (!detailsChanged && !pinChanged) {
      setPendingId(null);
      cancelEdit(barber.id);
      setToast({ message: "لا توجد تغييرات للحفظ", tone: "info" });
      return;
    }

    if (detailsChanged) {
      const result = await patchBarber(barber.id, updateBody);
      if (!result.ok) {
        setPendingId(null);
        return;
      }
    }

    if (pinChanged) {
      const pinSaved = await resetPin(barber.id, draft.pin);
      if (!pinSaved) {
        setPendingId(null);
        return;
      }
    }

    setPendingId(null);
    cancelEdit(barber.id);
    setToast({ message: pinChanged ? "تم حفظ البيانات وتحديث رمز الدخول" : "تم حفظ بيانات الحلاق", tone: "success" });
  }

  async function transferBarber(barber: SafeBarber, salonId: string) {
    if (!salonId || salonId === barber.salonId) return;

    const confirmed = await confirm({
      title: `نقل ${barber.name} إلى ${salonName(salonId)}؟`,
      description: "ستُسجَّل الزيارات الجديدة على الفرع الجديد. الزيارات السابقة تبقى في سجل الفرع القديم.",
      confirmLabel: "نقل",
    });
    if (!confirmed) return;

    setPendingId(barber.id);
    setToast(null);
    const result = await patchBarber(barber.id, { salonId });
    if (result.ok) {
      setToast({ message: `تم نقل ${barber.name} إلى ${salonName(salonId)}`, tone: "success" });
    }
    setPendingId(null);
  }

  async function toggleStatus(barber: SafeBarber) {
    setPendingId(barber.id);
    setToast(null);
    await patchBarber(barber.id, { isActive: !barber.isActive });
    setPendingId(null);
  }

  async function deleteBarber(barber: SafeBarber) {
    const confirmed = await confirm({
      title: `حذف ${barber.name} نهائيًا؟`,
      description: "لا يمكن التراجع عن هذا الإجراء.",
      confirmLabel: "حذف",
      tone: "danger",
    });
    if (!confirmed) return;

    setPendingId(barber.id);
    setToast(null);

    const response = await fetch(`/api/dashboard/barbers/${barber.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok) {
      setBarbers((current) => current.filter((item) => item.id !== barber.id));
      cancelEdit(barber.id);
      setToast({ message: "تم حذف الحلاق", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر حذف الحلاق", tone: "error" });
    }

    setPendingId(null);
  }

  return (
    <div className="mt-8 space-y-6">
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="dashboard-soft-panel p-4">
          <p className="text-xs font-bold text-salon-charcoal">إجمالي الحلاقين</p>
          <p className="mt-2 text-3xl font-bold">{barbers.length}</p>
        </div>
        <div className="dashboard-soft-panel p-4">
          <p className="text-xs font-bold text-salon-charcoal">حسابات نشطة</p>
          <p className="mt-2 text-3xl font-bold text-green-700">{activeCount}</p>
        </div>
        <div className="dashboard-soft-panel p-4">
          <p className="text-xs font-bold text-salon-charcoal">حسابات معطلة</p>
          <p className="mt-2 text-3xl font-bold text-salon-ruby">{inactiveCount}</p>
        </div>
      </section>

      <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[380px_1fr]" : ""}`}>
        {canManage ? (
        <form onSubmit={createBarber} className="dashboard-panel h-fit overflow-hidden">
          <div className="border-b border-salon-line bg-salon-ink px-5 py-4 text-white">
            <p className="text-xs font-bold text-salon-gold">حساب جديد</p>
            <h2 className="mt-2 text-2xl font-bold">إضافة حلاق</h2>
          </div>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-salon-charcoal">اسم الحلاق</span>
              <input name="name" required placeholder="مثال: عبدالله الغامدي" className="dashboard-field" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-salon-charcoal">رقم الجوال</span>
              <input
                name="phone"
                required
                inputMode="numeric"
                minLength={10}
                maxLength={10}
                pattern="05[0-9]{8}"
                autoComplete="tel"
                placeholder="05xxxxxxxx"
                onInput={(event) => {
                  event.currentTarget.value = sanitizePhone(event.currentTarget.value);
                }}
                className="dashboard-field"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-salon-charcoal">رمز الدخول</span>
              <input name="pin" required minLength={8} maxLength={64} placeholder="8 خانات على الأقل (أحرف وأرقام ورموز)" className="dashboard-field" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-salon-charcoal">الفرع</span>
              <select name="salonId" required defaultValue={defaultSalonId ?? salons[0]?.id ?? ""} className="dashboard-field">
                {salons.map((salon) => (
                  <option key={salon.id} value={salon.id}>{salon.name}</option>
                ))}
              </select>
            </label>
            <button disabled={loading} className="dashboard-button w-full">
              {loading ? "جاري الحفظ..." : "حفظ الحلاق"}
            </button>
          </div>
        </form>
        ) : null}

        <div className="dashboard-panel overflow-hidden">
          <div className="border-b border-salon-line px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold text-salon-gold">قائمة الحلاقين</p>
                <h2 className="mt-2 text-2xl font-bold">{canManage ? "التحكم الكامل بالحسابات" : "فريق فروعك"}</h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="بحث بالاسم أو الجوال"
                  className="dashboard-field py-2.5"
                />
                <div className="grid grid-cols-3 rounded-xl border border-salon-line bg-white p-1 text-xs font-bold">
                  {[
                    ["all", "الكل"],
                    ["active", "نشط"],
                    ["inactive", "معطل"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value as BarberFilter)}
                      className={`rounded-md px-3 py-2 transition ${filter === value ? "bg-salon-ink text-white" : "text-salon-charcoal hover:bg-salon-pearl"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="divide-y divide-salon-line">
            {filteredBarbers.map((barber) => {
              const isEditing = editingId === barber.id;
              const draft = drafts[barber.id];
              const isPending = pendingId === barber.id;

              return (
                <article
                  key={barber.id}
                  className={`grid gap-4 px-5 py-5 xl:items-start ${canManage ? "xl:grid-cols-[1fr_180px_260px]" : "xl:grid-cols-[1fr_320px]"}`}
                >
                  <div className="min-w-0">
                    {isEditing && draft ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-xs font-bold text-salon-charcoal">اسم الحلاق</span>
                          <input value={draft.name} onChange={(event) => updateDraft(barber.id, { name: event.target.value })} className="dashboard-field py-2.5" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-xs font-bold text-salon-charcoal">رقم الجوال</span>
                          <input
                            value={draft.phone}
                            onChange={(event) => updateDraft(barber.id, { phone: sanitizePhone(event.target.value) })}
                            inputMode="numeric"
                            minLength={10}
                            maxLength={10}
                            pattern="05[0-9]{8}"
                            autoComplete="tel"
                            placeholder="05xxxxxxxx"
                            className="dashboard-field py-2.5"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-xs font-bold text-salon-charcoal">رمز دخول جديد</span>
                          <input
                            data-pin-input={barber.id}
                            value={draft.pin}
                            onChange={(event) => updateDraft(barber.id, { pin: event.target.value })}
                            minLength={8}
                            maxLength={64}
                            placeholder="8 خانات على الأقل، اتركه فارغًا إذا لم يتغير"
                            className="dashboard-field py-2.5"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-xs font-bold text-salon-charcoal">نسبة العمولة %</span>
                          <input
                            value={draft.commissionRate}
                            onChange={(event) => updateDraft(barber.id, { commissionRate: event.target.value })}
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            placeholder="اتركه فارغًا لاستخدام نسبة الفرع"
                            className="dashboard-field py-2.5"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-salon-line bg-salon-pearl px-3 py-2.5">
                          <span className="text-sm font-bold text-salon-charcoal">الحساب نشط</span>
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(event) => updateDraft(barber.id, { isActive: event.target.checked })}
                            className="h-5 w-5 accent-salon-forest"
                          />
                        </label>
                        {hasMultipleSalons ? (
                          <label className="block md:col-span-2">
                            <span className="mb-2 block text-xs font-bold text-salon-charcoal">الفرع</span>
                            <select
                              value={draft.salonId}
                              onChange={(event) => updateDraft(barber.id, { salonId: event.target.value })}
                              className="dashboard-field py-2.5"
                            >
                              {salons.map((salon) => (
                                <option key={salon.id} value={salon.id}>{salon.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-bold">{barber.name}</h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${barber.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {barber.isActive ? "نشط" : "معطل"}
                          </span>
                        </div>
                        <dl className="mt-3 grid gap-2 text-sm font-bold text-salon-charcoal md:grid-cols-2">
                          <div>
                            <dt className="text-xs font-bold text-salon-charcoal/70">رقم الجوال</dt>
                            <dd className="mt-1 text-salon-ink">{barber.phone}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold text-salon-charcoal/70">الفرع</dt>
                            <dd className="mt-1 text-salon-ink">{salonName(barber.salonId)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold text-salon-charcoal/70">نسبة العمولة</dt>
                            <dd className="mt-1 text-salon-ink">
                              {barber.commissionRate == null ? "نسبة الفرع الافتراضية" : `${barber.commissionRate}%`}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold text-salon-charcoal/70">آخر تحديث</dt>
                            <dd className="mt-1 text-salon-ink">{barber.updatedAt ? dateFormatter.format(new Date(barber.updatedAt)) : "غير متاح"}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                  </div>

                  {!canManage ? (
                    <div className="rounded-xl border border-salon-line bg-salon-pearl px-4 py-3">
                      <p className="text-xs font-bold text-salon-charcoal">نقل بين فروعك</p>
                      {hasMultipleSalons ? (
                        <>
                          <select
                            value={barber.salonId ?? ""}
                            disabled={isPending}
                            onChange={(event) => void transferBarber(barber, event.target.value)}
                            className="dashboard-field mt-3 py-2.5 disabled:opacity-55"
                          >
                            {salons.map((salon) => (
                              <option key={salon.id} value={salon.id}>
                                {salon.name}
                              </option>
                            ))}
                          </select>
                          <p className="mt-2 text-xs font-semibold text-salon-charcoal/70">
                            {isPending ? "جاري النقل..." : "اختر الفرع لنقل الحلاق مباشرة"}
                          </p>
                        </>
                      ) : (
                        <p className="mt-3 text-sm font-semibold text-salon-charcoal/75">
                          النقل يحتاج فرعين مسندين لك على الأقل.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {canManage ? (
                  <div className="rounded-xl border border-salon-line bg-salon-pearl px-4 py-3">
                    <p className="text-xs font-bold text-salon-charcoal">حالة الوصول</p>
                    <button
                      type="button"
                      disabled={isPending || isEditing}
                      onClick={() => void toggleStatus(barber)}
                      className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-55 ${
                        barber.isActive ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-red-50 text-red-700 hover:bg-red-100"
                      }`}
                    >
                      {barber.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                    </button>
                  </div>
                  ) : null}

                  {canManage ? (
                  <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                    {isEditing ? (
                      <>
                        <button type="button" disabled={isPending} onClick={() => void saveBarber(barber)} className="dashboard-button py-2.5">
                          {isPending ? "جاري الحفظ..." : "حفظ"}
                        </button>
                        <button type="button" disabled={isPending} onClick={() => cancelEdit(barber.id)} className="dashboard-button-soft py-2.5">
                          إلغاء
                        </button>
                        <button type="button" disabled={isPending} onClick={() => void deleteBarber(barber)} className="dashboard-danger-button py-2.5">
                          حذف
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={Boolean(editingId) || isPending} onClick={() => startEdit(barber)} className="dashboard-button py-2.5">
                          تعديل
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(editingId) || isPending}
                          onClick={() => {
                            startEdit(barber);
                            setTimeout(() => {
                              document.querySelector<HTMLInputElement>(`[data-pin-input="${barber.id}"]`)?.focus();
                            }, 0);
                          }}
                          className="dashboard-button-soft py-2.5"
                        >
                          رمز جديد
                        </button>
                        <button type="button" disabled={Boolean(editingId) || isPending} onClick={() => void deleteBarber(barber)} className="dashboard-danger-button py-2.5">
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                  ) : null}
                </article>
              );
            })}

            {filteredBarbers.length === 0 ? (
              <div className="p-5"><InlineEmpty icon="🔎" title="لا توجد نتائج مطابقة" hint="غيّر كلمة البحث أو الفلتر لعرض حلاقين آخرين." /></div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
