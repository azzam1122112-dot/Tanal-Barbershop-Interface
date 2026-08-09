import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { ReceiptData } from "@/lib/invoicing/receipt";
import { PrintButton } from "./print-button";

/**
 * مستند الإيصال/الفاتورة. مصمّم بعرض إيصال حراري (80mm) فيطبع كما هو
 * على طابعة الكاشير، ويبقى مقروءًا على الشاشة وفي PDF المتصفح.
 */
export function InvoiceReceipt({ receipt, backHref }: { receipt: ReceiptData; backHref?: string }) {
  const { totals, seller } = receipt;
  const hasVat = totals.vatRate > 0;

  return (
    <div className="receipt-page min-h-screen bg-salon-mist px-4 py-6 print:bg-white print:p-0">
      <div className="receipt-actions mx-auto mb-4 flex max-w-[380px] items-center justify-between gap-3 print:hidden">
        {backHref ? (
          <a href={backHref} className="dashboard-button-soft px-4 py-2 text-sm">
            رجوع
          </a>
        ) : (
          <span />
        )}
        <PrintButton />
      </div>

      <article className="receipt-sheet mx-auto max-w-[380px] bg-white px-6 py-7 text-salon-ink shadow-sm print:max-w-none print:shadow-none">
        <header className="text-center">
          <h1 className="text-lg font-bold leading-tight">{seller.name}</h1>
          {seller.salonName && seller.salonName !== seller.name ? (
            <p className="mt-1 text-sm font-semibold text-salon-charcoal">{seller.salonName}</p>
          ) : null}
          <p className="mt-3 inline-block rounded-md border border-salon-line px-3 py-1 text-xs font-bold">
            {receipt.documentTitle}
          </p>
          {receipt.isTaxInvoice && seller.vatNumber ? (
            <p className="mt-2 text-xs font-semibold tabular-nums text-salon-charcoal">
              الرقم الضريبي: <span dir="ltr">{seller.vatNumber}</span>
            </p>
          ) : null}
        </header>

        {receipt.status === "CANCELLED" ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">
            هذه الزيارة ملغاة
          </p>
        ) : null}

        <dl className="mt-5 space-y-1.5 border-y border-dashed border-salon-line py-4 text-xs font-semibold">
          <Row label="رقم الفاتورة" value={receipt.invoiceNumber ?? "-"} ltr />
          <Row label="التاريخ" value={formatDateTime(receipt.visitedAt)} />
          <Row label="الحلاق" value={receipt.barber.name} />
          <Row label="العميل" value={receipt.customer.name} />
        </dl>

        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="border-b border-salon-line text-right">
              <th className="pb-2 font-bold">الخدمة</th>
              <th className="pb-2 text-center font-bold">الكمية</th>
              <th className="pb-2 text-left font-bold">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-salon-line/70">
            {receipt.services.map((service, index) => (
              <tr key={`${service.name}-${index}`}>
                <td className="py-2 font-semibold">{service.name}</td>
                <td className="py-2 text-center tabular-nums">{service.quantity}</td>
                <td className="py-2 text-left tabular-nums">{formatMoney(service.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1.5 border-t border-salon-line pt-4 text-xs font-semibold">
          <Row label="الإجمالي" value={formatMoney(totals.grossAmount)} />
          {totals.discountAmount > 0 ? <Row label="الخصم" value={`- ${formatMoney(totals.discountAmount)}`} /> : null}
          {hasVat ? (
            <>
              <Row label="الإجمالي قبل الضريبة" value={formatMoney(totals.subtotalAmount)} />
              <Row label={`ضريبة القيمة المضافة (${totals.vatRate}%)`} value={formatMoney(totals.vatAmount)} />
            </>
          ) : null}
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-salon-line pt-3">
            <dt className="text-sm font-bold">{hasVat ? "الإجمالي شامل الضريبة" : "المبلغ المستحق"}</dt>
            <dd className="text-base font-bold tabular-nums">{formatMoney(totals.netAmount)}</dd>
          </div>
          <Row label="طريقة الدفع" value={receipt.paymentMethod === "CASH" ? "كاش" : "شبكة"} />
        </dl>

        {receipt.loyalty.earnedPoints > 0 || receipt.loyalty.redeemedPoints > 0 ? (
          <dl className="mt-4 space-y-1.5 rounded-md bg-salon-pearl px-3 py-3 text-xs font-semibold">
            {receipt.loyalty.earnedPoints > 0 ? (
              <Row label="نقاط مكتسبة" value={formatNumber(receipt.loyalty.earnedPoints)} />
            ) : null}
            {receipt.loyalty.redeemedPoints > 0 ? (
              <Row label="نقاط مستبدلة" value={formatNumber(receipt.loyalty.redeemedPoints)} />
            ) : null}
            <Row label="رصيد النقاط الحالي" value={formatNumber(receipt.loyalty.balance)} />
          </dl>
        ) : null}

        {receipt.qrSvg ? (
          <div className="mt-5 flex flex-col items-center gap-2">
            <div
              className="receipt-qr h-[120px] w-[120px]"
              // الرمز SVG مبني على الخادم من بيانات الفاتورة فقط — لا مدخلات مستخدم حرة.
              dangerouslySetInnerHTML={{ __html: receipt.qrSvg }}
            />
            <p className="text-[10px] font-semibold text-salon-charcoal">امسح الرمز للتحقق من الفاتورة</p>
          </div>
        ) : null}

        <footer className="mt-6 border-t border-dashed border-salon-line pt-4 text-center text-[11px] font-semibold text-salon-charcoal">
          <p>شكرًا لزيارتك</p>
          {seller.organizationName ? <p className="mt-1">{seller.organizationName}</p> : null}
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-salon-charcoal">{label}</dt>
      <dd className="tabular-nums" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
