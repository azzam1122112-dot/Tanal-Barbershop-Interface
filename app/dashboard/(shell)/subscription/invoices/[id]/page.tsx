import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/receipt/print-button";
import { BrandLogo } from "@/components/brand-logo";
import { SubscriptionInvoiceEmailButton } from "@/components/dashboard/subscription-invoice-email-button";
import { getRequestSession } from "@/lib/auth/http";
import { canAccessDashboard } from "@/lib/auth/access";
import { getInvoiceForOrganization } from "@/lib/billing/billing-service";
import { prisma } from "@/lib/db/prisma";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { legalInfo } from "@/lib/legal";

export default async function SubscriptionInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session) || session.type !== "dashboard") redirect("/dashboard");

  const { id } = await params;
  const invoice = await getInvoiceForOrganization(prisma, session.organizationId, id);
  if (!invoice) notFound();

  return (
    <main className="receipt-page min-h-screen bg-salon-mist px-4 py-6 print:bg-white print:p-0">
      <div className="receipt-actions mx-auto mb-4 flex max-w-[820px] flex-wrap items-start justify-between gap-3 print:hidden">
        <Link href="/dashboard/subscription" className="dashboard-button-soft px-4 py-2 text-sm">العودة للاشتراك</Link>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <SubscriptionInvoiceEmailButton invoiceId={invoice.id} />
          <a href={`/api/dashboard/subscription/invoices/${invoice.id}/pdf`} className="dashboard-button-gold px-4 py-2 text-sm">تنزيل PDF الرسمي</a>
          <PrintButton label="طباعة" />
        </div>
      </div>

      <article className="receipt-sheet mx-auto max-w-[820px] overflow-hidden bg-white text-salon-ink shadow-lux print:max-w-none print:shadow-none">
        <div className="h-2 bg-gradient-to-l from-violet-950 via-violet-600 to-salon-gold" />
        <div className="px-6 py-8 sm:px-10">
        <header className="flex flex-col gap-5 border-b border-salon-line pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-16 w-16 rounded-2xl shadow-sm" />
            <div>
              <p className="text-xs font-bold text-violet-700">إكس مانس إكس XMANSX</p>
              <h1 className="mt-1 text-2xl font-bold">فاتورة اشتراك رسمية</h1>
              <p className="mt-1 text-sm font-semibold text-salon-charcoal">خدمة برمجية سحابية تقدم إلكترونيًا</p>
              <span className="mt-2 inline-flex rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold text-violet-800">فاتورة غير ضريبية</span>
            </div>
          </div>
          <dl className="space-y-1 text-sm font-semibold">
            <InvoiceRow label="رقم الفاتورة" value={invoice.invoiceNumber ?? invoice.id} ltr />
            <InvoiceRow label="تاريخ الإصدار" value={formatDate(invoice.issuedAt ?? invoice.paidAt ?? invoice.createdAt)} />
            <InvoiceRow label="تاريخ التفعيل" value={formatDate(invoice.periodStart ?? invoice.issuedAt ?? invoice.paidAt ?? invoice.createdAt)} />
            <InvoiceRow label="تاريخ الانتهاء" value={formatDate(invoice.periodEnd)} />
            <InvoiceRow label="حالة السداد" value="مدفوعة" />
          </dl>
        </header>

        <div className="grid gap-6 border-b border-salon-line py-6 sm:grid-cols-2">
          <section>
            <h2 className="text-xs font-bold text-violet-700">مقدم الخدمة</h2>
            <p className="mt-2 font-bold">{invoice.sellerName ?? legalInfo.providerName}</p>
            <p className="mt-1 text-sm font-semibold text-salon-charcoal">ممارس عمل حر · <span dir="ltr">{invoice.sellerFreelanceDocument ?? legalInfo.freelanceDocumentNumber}</span></p>
            <p className="mt-1 text-sm font-semibold text-salon-charcoal">{invoice.sellerActivity ?? legalInfo.freelanceActivity}</p>
            <p className="mt-1 text-sm font-semibold text-salon-charcoal">{legalInfo.businessAddress}</p>
          </section>
          <section>
            <h2 className="text-xs font-bold text-violet-700">العميل</h2>
            <p className="mt-2 font-bold">{invoice.buyer.name}</p>
            {invoice.buyer.owner ? <p className="mt-1 text-sm font-semibold text-salon-charcoal">المالك: {invoice.buyer.owner.name}</p> : null}
            {invoice.buyer.city ? <p className="mt-1 text-sm font-semibold text-salon-charcoal">{invoice.buyer.city}</p> : null}
            {invoice.buyer.owner?.email ? <p className="mt-1 text-sm font-semibold text-salon-charcoal" dir="ltr">{invoice.buyer.owner.email}</p> : null}
          </section>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-salon-line text-right"><th className="pb-3">الوصف</th><th className="pb-3">الفترة</th><th className="pb-3 text-left">المبلغ</th></tr></thead>
          <tbody><tr><td className="py-4"><p className="font-bold">اشتراك {invoice.planName ?? "إكس مانس إكس XMANSX"}</p>{invoice.planDescription ? <p className="mt-1 text-xs font-semibold text-salon-charcoal">{invoice.planDescription}</p> : null}</td><td className="py-4">{invoice.periodStart && invoice.periodEnd ? `${formatDate(invoice.periodStart)} - ${formatDate(invoice.periodEnd)}` : `${invoice.periodMonths} شهر`}</td><td className="py-4 text-left font-bold">{formatMoney(invoice.amount)}</td></tr></tbody>
        </table>

        {invoice.planLimits || invoice.planFeatures.length ? (
          <section className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
            <h2 className="text-sm font-bold text-violet-950">تفاصيل وحدود الباقة</h2>
            {invoice.planLimits ? (
              <div className="mt-3 grid gap-2 text-xs font-semibold sm:grid-cols-3">
                <PlanLimit label="الفروع" value={formatLimit(invoice.planLimits.maxSalons)} />
                <PlanLimit label="الحلاقون" value={formatLimit(invoice.planLimits.maxBarbers)} />
                <PlanLimit label="العملاء" value={formatLimit(invoice.planLimits.maxCustomers)} />
              </div>
            ) : null}
            {invoice.planFeatures.length ? <ul className="mt-3 grid gap-2 text-xs font-semibold text-salon-charcoal sm:grid-cols-2">{invoice.planFeatures.map((feature) => <li key={feature}>• {feature}</li>)}</ul> : null}
          </section>
        ) : null}

        <dl className="mr-auto mt-6 max-w-sm space-y-2 border-t border-salon-line pt-5 text-sm font-semibold">
          <InvoiceRow label="قيمة الاشتراك" value={formatMoney(invoice.amount)} />
          <InvoiceRow label="ضريبة القيمة المضافة" value="غير مطبقة (0.00 ريال)" />
          <div className="flex items-baseline justify-between gap-4 border-t border-salon-line pt-3 text-base font-bold"><dt>الإجمالي المدفوع</dt><dd>{formatMoney(invoice.amount)}</dd></div>
        </dl>

        <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-center text-xs font-semibold leading-6 text-violet-950">
          هذه فاتورة غير ضريبية. لا تُفرض ضريبة القيمة المضافة على هذا الاشتراك، وقيمة الضريبة صفر.
        </div>

        {invoice.invoiceEmailSentAt ? (
          <p className="mt-4 text-xs font-semibold text-green-700 print:hidden">تم إرسال نسخة PDF إلى <span dir="ltr">{invoice.invoiceEmailRecipient}</span> بتاريخ {formatDateTime(invoice.invoiceEmailSentAt)}.</p>
        ) : invoice.invoiceEmailLastError ? (
          <p className="mt-4 text-xs font-semibold text-amber-800 print:hidden">لم تُرسل نسخة البريد بعد: {invoice.invoiceEmailLastError}</p>
        ) : null}

        <footer className="mt-8 border-t border-dashed border-salon-line pt-5 text-xs font-semibold leading-6 text-salon-charcoal">
          <p>طريقة الدفع: {invoice.providerLabel}{invoice.reference ? ` · مرجع التحويل ${invoice.reference}` : ""}</p>
          <p>طريقة ومكان تقديم الخدمة: إلكترونيًا إلى حساب العميل على منصة إكس مانس إكس XMANSX.</p>
          <p>صدرت هذه الفاتورة عند اعتماد الاشتراك، ويمكن الرجوع إليها من حساب المالك.</p>
          <p>للتواصل: {legalInfo.supportEmail} · <span dir="ltr">{legalInfo.supportPhone}</span></p>
        </footer>
        </div>
      </article>
    </main>
  );
}

function PlanLimit({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-violet-100 bg-white px-3 py-2"><span className="text-salon-charcoal">{label}</span><strong className="mr-2 text-salon-ink">{value}</strong></div>;
}

function formatLimit(value: number | null) {
  return value === null ? "غير محدود" : formatNumber(value);
}

function InvoiceRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div className="flex items-baseline justify-between gap-4"><dt className="text-salon-charcoal">{label}</dt><dd className="font-bold" dir={ltr ? "ltr" : undefined}>{value}</dd></div>;
}
