"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { SafeBarber } from "@/lib/auth/sanitize";
import { buildBarberLoginMessage, toWhatsAppPhone } from "@/lib/barbers/login-share";
import { InlineEmpty } from "@/components/dashboard/ui";
import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";

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
  commissionEnabled: boolean;
  /** فارغ = استخدم النسبة الافتراضية للفرع. */
  commissionRate: string;
  workScheduleEnabled: boolean;
  workStartTime: string;
  workEndTime: string;
  workClosedWeekdays: number[];
};

type BarberFilter = "all" | "active" | "inactive";

const dateFormatter = new Intl.DateTimeFormat("ar-SA", {
  timeZone: RIYADH_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});
const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

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
  const [newCommissionEnabled, setNewCommissionEnabled] = useState(false);
  // لا نخزّن الرمز الخام في الخادم. نحتفظ مؤقتًا فقط بالرمز الذي أُنشئ أو تغيّر في هذه الصفحة.
  const [issuedPins, setIssuedPins] = useState<Record<string, string>>({});

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
    const commissionRate = String(form.get("commissionRate") ?? "").trim();
    const pin = String(form.get("pin") ?? "");

    const response = await fetch("/api/dashboard/barbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        pin,
        salonId: form.get("salonId"),
        commissionEnabled: form.get("commissionEnabled") === "on",
        commissionRate: commissionRate === "" ? null : Number(commissionRate),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok && data.barber) {
      setBarbers((current) => [data.barber!, ...current]);
      setIssuedPins((current) => ({ ...current, [data.barber!.id]: pin }));
      formElement.reset();
      setNewCommissionEnabled(false);
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
        commissionEnabled: Boolean(barber.commissionEnabled),
        commissionRate: barber.commissionRate == null ? "" : String(barber.commissionRate),
        workScheduleEnabled: Boolean(barber.workScheduleEnabled),
        workStartTime: minutesToTimeValue(barber.workStartMinute ?? 16 * 60),
        workEndTime: closeMinutesToTimeValue(barber.workEndMinute ?? 23 * 60),
        workClosedWeekdays: barber.workClosedWeekdays ?? [],
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
      setIssuedPins((current) => ({ ...current, [id]: pin }));
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
    if (draft.commissionEnabled !== Boolean(barber.commissionEnabled)) {
      updateBody.commissionEnabled = draft.commissionEnabled;
    }
    const draftRate = draft.commissionRate.trim();
    const currentRate = barber.commissionRate == null ? "" : String(barber.commissionRate);
    if (draftRate !== currentRate) updateBody.commissionRate = draftRate === "" ? null : Number(draftRate);
    if (draft.workScheduleEnabled !== Boolean(barber.workScheduleEnabled)) {
      updateBody.workScheduleEnabled = draft.workScheduleEnabled;
    }
    if (draft.workScheduleEnabled) {
      const startMinute = timeValueToMinutes(draft.workStartTime, barber.workStartMinute ?? 16 * 60);
      const endMinute = timeValueToCloseMinutes(draft.workEndTime, barber.workEndMinute ?? 23 * 60);
      if (startMinute !== barber.workStartMinute) updateBody.workStartMinute = startMinute;
      if (endMinute !== barber.workEndMinute) updateBody.workEndMinute = endMinute;
      if (!sameNumberSet(draft.workClosedWeekdays, barber.workClosedWeekdays ?? [])) {
        updateBody.workClosedWeekdays = draft.workClosedWeekdays;
      }
    }

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

  function loginMessage(barber: SafeBarber) {
    return buildBarberLoginMessage({
      name: barber.name,
      phone: barber.phone,
      loginUrl: `${window.location.origin}/barber/login`,
      pin: issuedPins[barber.id],
    });
  }

  async function copyLoginDetails(barber: SafeBarber) {
    try {
      await navigator.clipboard.writeText(loginMessage(barber));
      setToast({ message: `تم نسخ بيانات دخول ${barber.name}`, tone: "success" });
    } catch {
      setToast({ message: "تعذر النسخ تلقائيًا. تحقق من سماح المتصفح بالوصول إلى الحافظة.", tone: "error" });
    }
  }

  function shareLoginOnWhatsApp(barber: SafeBarber) {
    const phone = toWhatsAppPhone(barber.phone);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(loginMessage(barber))}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
            <div className="rounded-2xl border border-salon-line bg-salon-pearl p-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-bold text-salon-ink">تفعيل عمولة الحلاق</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-salon-charcoal/70">
                    عند الإيقاف لا تُحتسب عمولة ولا تظهر مستحقاتها للحلاق.
                  </span>
                </span>
                <input
                  name="commissionEnabled"
                  type="checkbox"
                  checked={newCommissionEnabled}
                  onChange={(event) => setNewCommissionEnabled(event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-salon-forest"
                />
              </label>
              {newCommissionEnabled ? (
                <label className="mt-4 block border-t border-salon-line pt-4">
                  <span className="mb-2 block text-xs font-bold text-salon-charcoal">نسبة الحلاق الخاصة %</span>
                  <input
                    name="commissionRate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="فارغ = نسبة الفرع الافتراضية"
                    className="dashboard-field"
                  />
                </label>
              ) : null}
            </div>
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
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-salon-line bg-salon-pearl px-3 py-2.5">
                          <span className="text-sm font-bold text-salon-charcoal">الحساب نشط</span>
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(event) => updateDraft(barber.id, { isActive: event.target.checked })}
                            className="h-5 w-5 accent-salon-forest"
                          />
                        </label>
                        <div className="rounded-xl border border-salon-line bg-salon-pearl p-4 md:col-span-2">
                          <label className="flex cursor-pointer items-center justify-between gap-4">
                            <span>
                              <span className="block text-sm font-bold text-salon-ink">تفعيل عمولة الحلاق</span>
                              <span className="mt-1 block text-xs font-semibold leading-5 text-salon-charcoal/70">
                                الإيقاف يمنع احتساب العمولة للزيارات الجديدة ويخفي بطاقة المستحقات من صفحة الحلاق.
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={draft.commissionEnabled}
                              onChange={(event) => updateDraft(barber.id, { commissionEnabled: event.target.checked })}
                              className="h-5 w-5 shrink-0 accent-salon-forest"
                            />
                          </label>
                          {draft.commissionEnabled ? (
                            <label className="mt-4 block border-t border-salon-line pt-4">
                              <span className="mb-2 block text-xs font-bold text-salon-charcoal">نسبة الحلاق الخاصة %</span>
                              <input
                                value={draft.commissionRate}
                                onChange={(event) => updateDraft(barber.id, { commissionRate: event.target.value })}
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                placeholder="فارغ = نسبة الفرع الافتراضية"
                                className="dashboard-field py-2.5"
                              />
                            </label>
                          ) : null}
                        </div>
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
                        <div className="rounded-xl border border-salon-line bg-salon-pearl p-4 md:col-span-2">
                          <label className="flex items-center justify-between gap-4">
                            <span>
                              <span className="block text-sm font-bold text-salon-ink">دوام مخصص للحلاق</span>
                              <span className="mt-1 block text-xs font-semibold text-salon-charcoal/70">
                                عند إيقافه يرث دوام الفرع. الدوام المخصص يبقى داخل نافذة حجز الفرع.
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={draft.workScheduleEnabled}
                              onChange={(event) => updateDraft(barber.id, { workScheduleEnabled: event.target.checked })}
                              className="h-5 w-5 shrink-0 accent-salon-forest"
                            />
                          </label>

                          {draft.workScheduleEnabled ? (
                            <div className="mt-4 grid gap-3 border-t border-salon-line pt-4 md:grid-cols-2">
                              <label className="block">
                                <span className="mb-2 block text-xs font-bold text-salon-charcoal">بداية الدوام</span>
                                <input
                                  type="time"
                                  dir="ltr"
                                  lang="en"
                                  value={draft.workStartTime}
                                  onChange={(event) => updateDraft(barber.id, { workStartTime: event.target.value })}
                                  className="dashboard-field py-2.5"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-xs font-bold text-salon-charcoal">نهاية الدوام</span>
                                <input
                                  type="time"
                                  dir="ltr"
                                  lang="en"
                                  value={draft.workEndTime}
                                  onChange={(event) => updateDraft(barber.id, { workEndTime: event.target.value })}
                                  className="dashboard-field py-2.5"
                                />
                                <span className="mt-1.5 block text-[11px] font-semibold text-salon-charcoal/70">
                                  12:00 ص = منتصف الليل (نهاية اليوم).
                                </span>
                              </label>
                              <fieldset className="md:col-span-2">
                                <legend className="mb-2 text-xs font-bold text-salon-charcoal">أيام إجازة الحلاق</legend>
                                <div className="flex flex-wrap gap-2">
                                  {WEEKDAYS.map((label, index) => {
                                    const closed = draft.workClosedWeekdays.includes(index);
                                    return (
                                      <button
                                        key={label}
                                        type="button"
                                        aria-pressed={closed}
                                        onClick={() =>
                                          updateDraft(barber.id, {
                                            workClosedWeekdays: closed
                                              ? draft.workClosedWeekdays.filter((day) => day !== index)
                                              : [...draft.workClosedWeekdays, index],
                                          })
                                        }
                                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                                          closed
                                            ? "border-salon-ruby bg-salon-ruby text-white"
                                            : "border-salon-line bg-white text-salon-charcoal"
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </fieldset>
                            </div>
                          ) : null}
                        </div>
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
                            <dt className="text-xs font-bold text-salon-charcoal/70">العمولة</dt>
                            <dd className={`mt-1 ${barber.commissionEnabled ? "text-green-700" : "text-salon-charcoal/65"}`}>
                              {barber.commissionEnabled
                                ? barber.commissionRate == null
                                  ? "مفعّلة · نسبة الفرع الافتراضية"
                                  : `مفعّلة · ${barber.commissionRate}%`
                                : "غير مفعّلة"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold text-salon-charcoal/70">آخر تحديث</dt>
                            <dd className="mt-1 text-salon-ink">{barber.updatedAt ? dateFormatter.format(new Date(barber.updatedAt)) : "غير متاح"}</dd>
                          </div>
                          <div className="md:col-span-2">
                            <dt className="text-xs font-bold text-salon-charcoal/70">دوام الحجز</dt>
                            <dd className="mt-1 text-salon-ink">{formatBarberSchedule(barber)}</dd>
                          </div>
                        </dl>
                        {canManage ? (
                          <div className="mt-4 rounded-2xl border border-violet-200/70 bg-violet-50/60 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-black text-violet-950">دخول تطبيق الحلاق</p>
                                <p className="mt-1 text-[11px] font-semibold text-violet-900/65">
                                  الرابط والجوال{issuedPins[barber.id] ? " والرمز الجديد" : " مع الرمز المسلّم سابقًا"}
                                </p>
                              </div>
                              {issuedPins[barber.id] ? (
                                <span className="rounded-full bg-violet-700 px-2.5 py-1 text-[10px] font-black text-white">
                                  الرمز جاهز للمشاركة
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => void copyLoginDetails(barber)}
                                className="dashboard-button-soft min-h-11 px-3 text-xs"
                              >
                                نسخ بيانات الدخول
                              </button>
                              <button
                                type="button"
                                onClick={() => shareLoginOnWhatsApp(barber)}
                                className="min-h-11 rounded-xl bg-[#128c7e] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[#0f796d] active:scale-[0.99]"
                              >
                                إرسال عبر واتساب
                              </button>
                            </div>
                          </div>
                        ) : null}
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

function minutesToTimeValue(minutes: number) {
  const safe = Math.max(0, Math.min(24 * 60, Math.trunc(minutes)));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeValueToMinutes(value: string, fallback: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * `24:00` مرفوضة في `input[type=time]`، فمنتصف الليل يُكتب `00:00` ويُقرأ في
 * **خانة النهاية وحدها** نهايةَ اليوم — وإلا تعذّر على حلاق في فرع 24 ساعة أن
 * ينهي دوامه منتصف الليل. نفس القاعدة في إعدادات نافذة حجز الفرع.
 */
function closeMinutesToTimeValue(minutes: number) {
  return minutes >= 24 * 60 ? "00:00" : minutesToTimeValue(minutes);
}

function timeValueToCloseMinutes(value: string, fallback: number) {
  const minutes = timeValueToMinutes(value, fallback);
  return minutes === 0 ? 24 * 60 : minutes;
}

function sameNumberSet(left: number[], right: number[]) {
  const normalize = (values: number[]) => [...new Set(values)].sort((a, b) => a - b).join(",");
  return normalize(left) === normalize(right);
}

function formatBarberSchedule(barber: SafeBarber) {
  if (!barber.workScheduleEnabled) return "يرث ساعات دوام الفرع";
  const start = formatMinuteLabel(barber.workStartMinute ?? 16 * 60);
  const end = formatMinuteLabel(barber.workEndMinute ?? 23 * 60);
  const closed = (barber.workClosedWeekdays ?? []).map((day) => WEEKDAYS[day]).filter(Boolean);
  return `${start} – ${end}${closed.length > 0 ? ` · الإجازة: ${closed.join("، ")}` : " · بلا إجازة أسبوعية"}`;
}

function formatMinuteLabel(minutes: number) {
  if (minutes === 24 * 60) return "12:00 ص";
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? "ص" : "م";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
