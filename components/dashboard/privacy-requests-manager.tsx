"use client";

import { FormEvent, useState } from "react";

type Row = { id: string; type: string; status: string; details: string | null; requestedName: string | null; requestedPhone: string | null; resolutionNote: string | null; createdAt: string; identityVerifiedAt: string | null; executedAt: string | null; customer: { name: string; phone: string } | null };

const typeLabels: Record<string, string> = { ACCESS: "وصول", COPY: "نسخة", CORRECTION: "تصحيح", DELETION: "حذف", WITHDRAW_CONSENT: "سحب موافقة" };
const statusLabels: Record<string, string> = { OPEN: "مفتوح", IN_PROGRESS: "قيد المعالجة", COMPLETED: "مكتمل", REJECTED: "مرفوض" };

export function PrivacyRequestsManager({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [message, setMessage] = useState("");

  async function update(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/dashboard/privacy-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: form.get("status"), resolutionNote: form.get("resolutionNote") }) });
    const data = (await response.json().catch(() => ({}))) as { request?: Partial<Row>; message?: string };
    if (response.ok && data.request) {
      setRows((current) => current.map((row) => row.id === id ? { ...row, ...data.request } : row));
      setMessage("تم تحديث الطلب");
    } else setMessage(data.message ?? "تعذر تحديث الطلب");
  }

  return <div className="mt-6 space-y-4">{message ? <p className="rounded-xl bg-salon-mist px-4 py-3 text-sm font-bold">{message}</p> : null}{rows.length === 0 ? <p className="dashboard-panel p-6 text-sm font-semibold text-salon-charcoal">لا توجد طلبات خصوصية.</p> : rows.map((row) => {
    const closed = row.status === "COMPLETED" || row.status === "REJECTED";
    return <article key={row.id} className="dashboard-panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-violet-700">{typeLabels[row.type] ?? row.type} · {statusLabels[row.status] ?? row.status}</p><h2 className="mt-1 text-lg font-bold">{row.customer?.name ?? "تم حذف بيانات العميل"}</h2>{row.customer ? <p className="mt-1 text-sm font-semibold text-salon-charcoal" dir="ltr">{row.customer.phone}</p> : null}<p className={`mt-2 text-xs font-bold ${row.identityVerifiedAt ? "text-emerald-700" : "text-red-700"}`}>{row.identityVerifiedAt ? "✓ تحققت الهوية برابط البطاقة ومطابقة الجوال" : "لم تُوثق الهوية — التنفيذ محظور"}</p></div><time className="text-xs font-semibold text-salon-charcoal">{new Date(row.createdAt).toLocaleDateString("ar-SA-u-nu-latn")}</time></div>{row.details ? <p className="mt-4 rounded-xl bg-salon-mist px-4 py-3 text-sm font-semibold leading-7">{row.details}</p> : null}{row.type === "CORRECTION" ? <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold"><p className="font-bold">التصحيح المطلوب</p><p className="mt-1">الاسم: {row.requestedName || "بلا تغيير"} · الجوال: <span dir="ltr">{row.requestedPhone || "بلا تغيير"}</span></p></div> : null}{row.type === "DELETION" && !closed ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-900">عند اختيار «تنفيذ وإغلاق» سيُحذف سجل العميل والاسم والجوال والموافقات والرسائل والولاء نهائيًا، وتبقى الزيارات المالية بلا هوية.</p> : null}{closed ? <div className="mt-4 rounded-xl bg-salon-mist px-4 py-3 text-sm font-semibold"><p>{row.resolutionNote}</p>{row.executedAt ? <p className="mt-1 text-xs font-bold text-emerald-700">تم التنفيذ فعليًا</p> : null}</div> : <form onSubmit={(event) => void update(event, row.id)} className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto]"><select name="status" defaultValue={row.status === "OPEN" ? "IN_PROGRESS" : row.status} className="dashboard-field"><option value="IN_PROGRESS">حفظ كقيد المعالجة</option><option value="COMPLETED">تنفيذ وإغلاق</option><option value="REJECTED">رفض مع السبب</option></select><input name="resolutionNote" required minLength={3} maxLength={1000} defaultValue={row.resolutionNote ?? ""} placeholder="الإجراء المتخذ أو سبب الرفض" className="dashboard-field" /><button className="dashboard-button">تطبيق</button></form>}</article>;
  })}</div>;
}
