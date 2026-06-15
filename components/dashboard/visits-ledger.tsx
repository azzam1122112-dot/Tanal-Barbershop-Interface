"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { VisitAdminActions } from "@/components/dashboard/visit-admin-actions";
import type { VisitDashboardRow } from "@/lib/visits/visit-summary";

type DiscountMaps = {
  rewards: Record<string, string>;
  campaigns: Record<string, string>;
};

export function VisitsLedger({ visits, discounts }: { visits: VisitDashboardRow[]; discounts: DiscountMaps }) {
  const [openVisitId, setOpenVisitId] = useState<string | null>(visits[0]?.id ?? null);

  return (
    <div className="overflow-hidden">
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
                    <p className="whitespace-nowrap text-sm font-black">{formatDate(visit.visitedAt)}</p>
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">{formatTime(visit.visitedAt)}</p>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <p className="max-w-[190px] truncate font-black">{visit.customer.name}</p>
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">{visit.customer.phone}</p>
                  </td>
                  <td className="px-4 py-3 align-middle font-bold">{visit.barber.name}</td>
                  <td className="px-4 py-3 align-middle">
                    <p className="max-w-[240px] truncate text-sm font-semibold">{visit.services.join("، ") || "-"}</p>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <p className="whitespace-nowrap text-base font-black text-salon-forest">{formatMoney(visit.netAmount)}</p>
                    {visit.discountAmount > 0 ? <p className="mt-1 text-xs font-semibold text-salon-gold">خصم {formatMoney(visit.discountAmount)}</p> : null}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <VisitBadge tone={visit.paymentMethod === "CASH" ? "neutral" : "info"}>{visit.paymentMethod === "CASH" ? "كاش" : "شبكة"}</VisitBadge>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <VisitBadge tone={visit.status === "COMPLETED" ? "success" : "danger"}>{visit.status === "COMPLETED" ? "مؤكدة" : "ملغاة"}</VisitBadge>
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
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="grid gap-3 md:grid-cols-4">
                          <DetailTile label="المبلغ" value={formatMoney(visit.grossAmount)} />
                          <DetailTile label="الخصم" value={formatMoney(visit.discountAmount)} />
                          <DetailTile label="النقاط" value={visit.pointsEarned.toLocaleString("ar-SA")} />
                          <DetailTile label="نوع الخصم" value={discountLabel(visit, discounts)} wide />
                        </div>
                        <div className="grid gap-3">
                          <Link
                            href={`/dashboard/whatsapp?customerId=${visit.customer.id}&visitId=${visit.id}`}
                            className="dashboard-button py-3 text-center"
                          >
                            رسالة واتساب
                          </Link>
                          <VisitAdminActions visit={visit} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-right">{children}</th>;
}

function DetailTile({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-salon-line bg-white px-4 py-3 shadow-sm shadow-salon-ink/5 ${wide ? "md:col-span-1" : ""}`}>
      <p className="text-xs font-bold text-salon-charcoal/70">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-salon-ink">{value}</p>
    </div>
  );
}

function VisitBadge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "info" | "success" | "danger" }) {
  const toneClass = {
    neutral: "bg-salon-mist text-salon-charcoal",
    info: "bg-salon-steel/10 text-salon-steel",
    success: "bg-green-50 text-green-700",
    danger: "bg-red-50 text-red-700",
  }[tone];

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${toneClass}`}>{children}</span>;
}

function discountLabel(visit: VisitDashboardRow, discounts: DiscountMaps) {
  if (visit.discountType === "REWARD") return visit.rewardRuleId ? discounts.rewards[visit.rewardRuleId] ?? "مكافأة نقاط" : "مكافأة نقاط";
  if (visit.discountType === "MANAGER_REWARD") return "مكافأة إدارية";
  if (visit.discountType === "CAMPAIGN") return visit.campaignId ? discounts.campaigns[visit.campaignId] ?? "حملة" : "حملة";
  return "بدون";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ar-SA");
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ريال`;
}
