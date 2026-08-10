import { redirect } from "next/navigation";
import { DashboardShell, StatCard } from "@/components/dashboard/ui";
import { SubscriptionSelfService } from "@/components/dashboard/subscription-self-service";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { formatDate, formatNumber } from "@/lib/format";
import { getOrganizationSubscriptionOverview } from "@/lib/plans/subscription-service";
import { listInvoices } from "@/lib/billing/billing-service";

function usageText(used: number, limit: number | null, unit: string) {
  return limit === null ? `${formatNumber(used)} ${unit}` : `${formatNumber(used)} من ${formatNumber(limit)} ${unit}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    TRIALING: "تجربة مجانية",
    ACTIVE: "اشتراك نشط",
    PAST_DUE: "متأخر الدفع",
    CANCELED: "التجديد ملغي",
  };
  return labels[status] ?? status;
}

export default async function DashboardSubscriptionPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (session.type !== "dashboard" || session.role === "SUPERVISOR") redirect("/dashboard/forbidden");

  const [overview, invoices] = await Promise.all([
    getOrganizationSubscriptionOverview(prisma, session.organizationId),
    listInvoices(prisma, session.organizationId, 24),
  ]);
  if (!overview) redirect("/dashboard/login");

  const currentPlan = overview.organization.plan;
  const usage = overview.organization.usage;
  const deadline = overview.organization.subscriptionStatus === "TRIALING"
    ? overview.organization.trialEndsAt
    : overview.organization.currentPeriodEnd;
  const inactivityStartedAt = overview.organization.inactiveSince
    ?? (deadline && new Date(deadline) <= new Date() ? deadline : null);
  const scheduledDeletionAt = inactivityStartedAt
    ? new Date(new Date(inactivityStartedAt).getTime() + 60 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return (
    <DashboardShell
      title="اشتراكي"
      description="اختر باقتك، أرسل مرجع الدفع، تابع حالة الطلب، وتحكم في تجديد اشتراك مؤسستك من مكان واحد."
    >
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="الباقة الحالية" value={currentPlan?.name ?? "التجربة"} subValue={statusLabel(overview.organization.subscriptionStatus)} />
        <StatCard label="الفروع" value={usageText(usage.salons, currentPlan?.maxSalons ?? null, "فرع")} />
        <StatCard label="الحلاقون" value={usageText(usage.barbers, currentPlan?.maxBarbers ?? null, "حلاق")} />
        <StatCard label="سريان الاشتراك" value={formatDate(deadline)} subValue={deadline ? "تبقى بياناتك محفوظة بعد الانتهاء" : "لا توجد فترة مدفوعة"} />
      </div>

      <SubscriptionSelfService
        plans={overview.plans}
        currentPlanId={currentPlan?.id ?? null}
        initialStatus={overview.organization.subscriptionStatus}
        currentPeriodEnd={overview.organization.currentPeriodEnd}
        usage={usage}
        initialInvoices={invoices}
        bank={{
          bankName: process.env.SUBSCRIPTION_BANK_NAME?.trim() || "مصرف الراجحي",
          accountName: process.env.SUBSCRIPTION_ACCOUNT_NAME?.trim() || "MANSOUR ALGHAMDI",
          iban: process.env.SUBSCRIPTION_IBAN?.trim() || "SA85 8000 0660 6080 1622 0957",
        }}
      />

      <section className="dashboard-panel mt-6 p-5">
        <h2 className="text-xl font-bold">بيانات الحساب والاحتفاظ</h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-salon-charcoal">
          يستطيع المالك تنزيل نسخة JSON من بيانات النشاط. بعد توقف التجربة أو الاشتراك 60 يومًا يحذف النظام بيانات الحساب
          من قاعدة البيانات التشغيلية، وقد تبقى نسخة احتياطية معزولة مدة لا تتجاوز 30 يومًا إضافية. نزّل النسخة قبل الموعد إذا كنت تحتاجها.
        </p>
        {scheduledDeletionAt ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">موعد الحذف المتوقع إذا بقي الحساب غير نشط: {formatDate(scheduledDeletionAt)}</p> : null}
        {session.role === "OWNER" ? <a href="/api/dashboard/account/export" className="dashboard-button mt-4 inline-flex">تصدير جميع بيانات الحساب</a> : <p className="mt-3 text-xs font-semibold text-salon-charcoal">التصدير متاح لمالك الحساب فقط.</p>}
      </section>
    </DashboardShell>
  );
}
