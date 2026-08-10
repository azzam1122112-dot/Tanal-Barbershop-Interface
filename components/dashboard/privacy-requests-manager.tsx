"use client";

import { FormEvent, useState } from "react";

type Row = { id: string; type: string; status: string; details: string | null; resolutionNote: string | null; createdAt: string; customer: { name: string; phone: string } };

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

  return <div className="mt-6 space-y-4">{message ? <p className="rounded-xl bg-salon-mist px-4 py-3 text-sm font-bold">{message}</p> : null}{rows.length === 0 ? <p className="dashboard-panel p-6 text-sm font-semibold text-salon-charcoal">لا توجد طلبات خصوصية.</p> : rows.map((row) => <article key={row.id} className="dashboard-panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-violet-700">{typeLabels[row.type] ?? row.type} · {statusLabels[row.status] ?? row.status}</p><h2 className="mt-1 text-lg font-bold">{row.customer.name}</h2><p className="mt-1 text-sm font-semibold text-salon-charcoal" dir="ltr">{row.customer.phone}</p></div><time className="text-xs font-semibold text-salon-charcoal">{new Date(row.createdAt).toLocaleDateString("ar-SA-u-nu-latn")}</time></div>{row.details ? <p className="mt-4 rounded-xl bg-salon-mist px-4 py-3 text-sm font-semibold leading-7">{row.details}</p> : null}<form onSubmit={(event) => void update(event, row.id)} className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto]"><select name="status" defaultValue={row.status === "OPEN" ? "IN_PROGRESS" : row.status} className="dashboard-field"><option value="IN_PROGRESS">قيد المعالجة</option><option value="COMPLETED">مكتمل</option><option value="REJECTED">مرفوض</option></select><input name="resolutionNote" required minLength={3} maxLength={1000} defaultValue={row.resolutionNote ?? ""} placeholder="الإجراء المتخذ أو سبب الرفض" className="dashboard-field" /><button className="dashboard-button">حفظ</button></form></article>)}</div>;
}
