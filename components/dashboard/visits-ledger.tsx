"use client";

import { Fragment, useState } from "react";
import { formatDate, formatMoney, formatNumber, formatTime } from "@/lib/format";
import Link from "next/link";
import { Badge, TableScroller } from "@/components/dashboard/ui";
import { VisitAdminActions } from "@/components/dashboard/visit-admin-actions";
import type { VisitDashboardRow } from "@/lib/visits/visit-summary";

type DiscountMaps = {
  rewards: Record<string, string>;
  campaigns: Record<string, string>;
};

/**
 * سجل الزيارات بعرضين لنفس البيانات:
 * - جوال/تابلت: بطاقات. ثمانية أعمدة لا تُقرأ على شاشة جوال، والسحب الأفقي
 *   في أكثر شاشة تشغيلية استخدامًا عبء يومي على المدير.
 * - ديسكتوب (lg فما فوق): الجدول الكامل حيث تتّسع الشاشة للمقارنة بين الصفوف.
 *
 * تفاصيل الزيارة وأزرارها مشتركة بين العرضين (`VisitDetails`) فلا يتفرّع السلوك.
 */
export function VisitsLedger({ visits, discounts }: { visits: VisitDashboardRow[]; discounts: DiscountMaps }) {
  const [openVisitId, setOpenVisitId] = useState<string | null>(visits[0]?.id ?? null);

  return (
    <>
      {/* ===== بطاقات: أقل من lg ===== */}
      <ul className="divide-y divide-salon-line/70 lg:hidden">
        {visits.map((visit) => {
          const isOpen = openVisitId === visit.id;

          return (
            <li key={visit.id} className={isOpen ? "bg-salon-pearl" : "bg-white"}>
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">{visit.customer?.name ?? "عميل زائر"}</p>
                    {visit.customer ? <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/70" dir="ltr">
                      {visit.customer.phone}
                    </p> : null}
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="whitespace-nowrap text-lg font-bold tabular-nums text-salon-forest">
                      {formatMoney(visit.netAmount)}
                    </p>
                    {visit.discountAmount > 0 ? (
                      <p className="mt-0.5 whitespace-nowrap text-[11px] font-semibold text-salon-gold">
                        خصم {formatMoney(visit.discountAmount)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={visit.paymentMethod === "CASH" ? "neutral" : "info"}>
                    {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"}
                  </Badge>
                  <Badge tone={visit.status === "COMPLETED" ? "success" : "danger"}>
                    {visit.status === "COMPLETED" ? "مؤكدة" : "ملغاة"}
                  </Badge>
                  <span className="text-[11px] font-semibold text-salon-charcoal/70">
                    {formatDate(visit.visitedAt)} · {formatTime(visit.visitedAt)}
                  </span>
                </div>

                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-salon-charcoal/70">الحلاق</dt>
                    <dd className="min-w-0 truncate font-bold">{visit.barber.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-salon-charcoal/70">الخدمات</dt>
                    <dd className="min-w-0 font-semibold">{visit.services.join("، ") || "-"}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => setOpenVisitId(isOpen ? null : visit.id)}
                  className="dashboard-button-soft mt-3 min-h-11 w-full py-2.5"
                  aria-expanded={isOpen}
                >
                  {isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل والإجراءات"}
                </button>
              </div>

              {isOpen ? (
                <div className="border-t border-salon-line/70 bg-salon-pearl/70 px-4 py-4">
                  <VisitDetails visit={visit} discounts={discounts} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* ===== جدول: lg فما فوق ===== */}
      <div className="hidden lg:block">
        <div className="table-scroll-wrap">
          <TableScroller label="سجل الزيارات">
            <table className="dashboard-table min-w-[1060px]">
              <thead className="sticky top-0 z-[1]">
                <tr>
                  <Header>التاريخ</Header>
                  <Header>العميل</Header>
                  <Header>الحلاق</Header>
                  <Header>الخدمات</Header>
                  <Header>الصافي</Header>
                  <Header>الدفع</Header>
                  <Header>الحالة</Header>
                  <Header>إجراء</Header>
                </tr>
              </thead>
              <tbody className="divide-y divide-salon-line">
                {visits.map((visit) => {
                  const isOpen = openVisitId === visit.id;

                  return (
                    <Fragment key={visit.id}>
                      <tr className={isOpen ? "bg-salon-pearl" : "bg-white"}>
                        <td className="px-4 py-3 align-middle">
                          <p className="whitespace-nowrap text-sm font-bold">{formatDate(visit.visitedAt)}</p>
                          <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">{formatTime(visit.visitedAt)}</p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="max-w-[190px] truncate font-bold">{visit.customer?.name ?? "عميل زائر"}</p>
                          {visit.customer ? <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">{visit.customer.phone}</p> : null}
                        </td>
                        <td className="px-4 py-3 align-middle font-bold">{visit.barber.name}</td>
                        <td className="px-4 py-3 align-middle">
                          <p className="max-w-[240px] truncate text-sm font-semibold">{visit.services.join("، ") || "-"}</p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="whitespace-nowrap text-base font-black tabular-nums text-salon-forest">{formatMoney(visit.netAmount)}</p>
                          {visit.discountAmount > 0 ? <p className="mt-1 text-xs font-semibold text-salon-gold">خصم {formatMoney(visit.discountAmount)}</p> : null}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge tone={visit.paymentMethod === "CASH" ? "neutral" : "info"}>{visit.paymentMethod === "CASH" ? "كاش" : "شبكة"}</Badge>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge tone={visit.status === "COMPLETED" ? "success" : "danger"}>{visit.status === "COMPLETED" ? "مؤكدة" : "ملغاة"}</Badge>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <button
                            type="button"
                            onClick={() => setOpenVisitId(isOpen ? null : visit.id)}
                            className="dashboard-button-soft whitespace-nowrap px-3 py-2"
                            aria-expanded={isOpen}
                          >
                            {isOpen ? "إخفاء" : "فتح"}
                          </button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-salon-pearl/70">
                          <td colSpan={8} className="px-4 py-4">
                            <VisitDetails visit={visit} discounts={discounts} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableScroller>
        </div>
      </div>
    </>
  );
}

function VisitDetails({ visit, discounts }: { visit: VisitDashboardRow; discounts: DiscountMaps }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <DetailTile label="المبلغ" value={formatMoney(visit.grossAmount)} />
        <DetailTile label="الخصم" value={formatMoney(visit.discountAmount)} />
        <DetailTile label="النقاط" value={formatNumber(visit.pointsEarned)} />
        {visit.invoiceNumber ? <DetailTile label="رقم الفاتورة" value={visit.invoiceNumber} /> : null}
        <DetailTile label="نوع الخصم" value={discountLabel(visit, discounts)} />
      </div>
      <div className="grid gap-2">
        <Link href={`/receipt/${visit.id}`} className="dashboard-button min-h-11 py-3 text-center">
          الإيصال / الفاتورة
        </Link>
        {visit.customer ? <Link
          href={`/dashboard/whatsapp?customerId=${visit.customer.id}&visitId=${visit.id}`}
          className="dashboard-button-soft min-h-11 py-3 text-center"
        >
          رسالة واتساب
        </Link> : null}
        <VisitAdminActions visit={visit} />
      </div>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-right">{children}</th>;
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-salon-line bg-white px-4 py-3 shadow-sm shadow-salon-ink/5">
      <p className="text-xs font-bold text-salon-charcoal/70">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-salon-ink">{value}</p>
    </div>
  );
}

function discountLabel(visit: VisitDashboardRow, discounts: DiscountMaps) {
  if (visit.discountType === "REWARD") return visit.rewardRuleId ? discounts.rewards[visit.rewardRuleId] ?? "مكافأة نقاط" : "مكافأة نقاط";
  if (visit.discountType === "MANAGER_REWARD") return "مكافأة إدارية";
  if (visit.discountType === "CAMPAIGN") return visit.campaignId ? discounts.campaigns[visit.campaignId] ?? "حملة" : "حملة";
  return "بدون";
}
