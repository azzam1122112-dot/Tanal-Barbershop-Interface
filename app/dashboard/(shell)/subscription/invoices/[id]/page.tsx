import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/receipt/print-button";
import { getRequestSession } from "@/lib/auth/http";
import { canAccessDashboard } from "@/lib/auth/access";
import { getInvoiceForOrganization } from "@/lib/billing/billing-service";
import { prisma } from "@/lib/db/prisma";
import { formatDate, formatMoney } from "@/lib/format";
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
      <div className="receipt-actions mx-auto mb-4 flex max-w-[760px] items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/subscription" className="dashboard-button-soft px-4 py-2 text-sm">العودة للاشتراك</Link>
        <PrintButton label="طباعة / حفظ PDF" />
      </div>

      <article className="receipt-sheet mx-auto max-w-[760px] bg-white px-6 py-8 text-salon-ink shadow-sm print:max-w-none print:shadow-none sm:px-10">
        <header className="flex flex-col gap-5 border-b border-salon-line pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold text-violet-700" dir="ltr">XMANSX</p>
            <h1 className="mt-2 text-2xl font-bold">فاتورة اشتراك</h1>
            <p className="mt-2 text-sm font-semibold text-salon-charcoal">خدمة برمجية سحابية تقدم إلكترونيًا</p>
          </div>
          <dl className="space-y-1 text-sm font-semibold">
            <InvoiceRow label="رقم الفاتورة" value={invoice.invoiceNumber ?? invoice.id} ltr />
            <InvoiceRow label="تاريخ الإصدار" value={formatDate(invoice.issuedAt ?? invoice.paidAt ?? invoice.createdAt)} />
            <InvoiceRow label="تاريخ تقديم الخدمة" value={formatDate(invoice.periodStart ?? invoice.issuedAt ?? invoice.paidAt ?? invoice.createdAt)} />
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
          <tbody><tr><td className="py-4"><p className="font-bold">اشتراك {invoice.planName ?? "XMANSX"}</p>{invoice.planDescription ? <p className="mt-1 text-xs font-semibold text-salon-charcoal">{invoice.planDescription}</p> : null}</td><td className="py-4">{invoice.periodStart && invoice.periodEnd ? `${formatDate(invoice.periodStart)} - ${formatDate(invoice.periodEnd)}` : `${invoice.periodMonths} شهر`}</td><td className="py-4 text-left font-bold">{formatMoney(invoice.amount)}</td></tr></tbody>
        </table>

        <dl className="mr-auto mt-6 max-w-sm space-y-2 border-t border-salon-line pt-5 text-sm font-semibold">
          <InvoiceRow label="المجموع" value={formatMoney(invoice.amount)} />
          <div className="flex items-baseline justify-between gap-4 border-t border-salon-line pt-3 text-base font-bold"><dt>الإجمالي المدفوع</dt><dd>{formatMoney(invoice.amount)}</dd></div>
        </dl>

        <footer className="mt-8 border-t border-dashed border-salon-line pt-5 text-xs font-semibold leading-6 text-salon-charcoal">
          <p>طريقة الدفع: {invoice.providerLabel}{invoice.reference ? ` · مرجع التحويل ${invoice.reference}` : ""}</p>
          <p>طريقة ومكان تقديم الخدمة: إلكترونيًا إلى حساب العميل على منصة XMANSX.</p>
          <p>صدرت هذه الفاتورة عند اعتماد الاشتراك، ويمكن الرجوع إليها من حساب المالك.</p>
          <p>للتواصل: {legalInfo.supportEmail} · <span dir="ltr">{legalInfo.supportPhone}</span></p>
        </footer>
      </article>
    </main>
  );
}

function InvoiceRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div className="flex items-baseline justify-between gap-4"><dt className="text-salon-charcoal">{label}</dt><dd className="font-bold" dir={ltr ? "ltr" : undefined}>{value}</dd></div>;
}
