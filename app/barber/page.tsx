import { formatAmount as formatMoney } from "@/lib/format";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { LogoutButton } from "@/components/logout-button";
import { CustomerSearch } from "@/components/barber/customer-search";
import { BarberCustodyCard, CashSessionPanel } from "@/components/barber/cash-session-panel";
import { BarberHomeTabs, type BarberTab } from "@/components/barber/home-tabs";
import { BarberInstallCard } from "@/components/barber/install-card";
import { getBarberTodaySummary } from "@/lib/barber/barber-summary";
import { getSubscriptionState } from "@/lib/plans/subscription-guard";
import { getSessionExpenses } from "@/lib/expenses/expense-service";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { getOpenAttendance } from "@/lib/attendance/attendance-service";
import { listAppointments } from "@/lib/appointments/appointment-service";
import { BARBER_APPOINTMENTS_DAYS } from "@/lib/appointments/barber-window";
import { AttendancePanel } from "@/components/barber/attendance-panel";
import { BarberNotificationCenter } from "@/components/barber/notification-center";
import { BarberAppointmentsPanel } from "@/components/barber/appointments-panel";
import { BarberStockPanel } from "@/components/barber/stock-panel";
import { listProducts } from "@/lib/products/product-service";
import { listStockReports } from "@/lib/products/stock-report-service";
import { BarberSuppliesPanel } from "@/components/barber/supplies-panel";
import { listSupplyItems } from "@/lib/supplies/supply-service";
import { prisma } from "@/lib/db/prisma";
import { getBarberMonthlyCommission } from "@/lib/commissions/barber-monthly-commission";
import { getBarberCommissionBalance } from "@/lib/commissions/commission-payout";
import Link from "next/link";
import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";

export default async function BarberHomePage() {
  const session = await getRequestSession();

  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");
  const [summary, monthlyCommission, commissionBalance, organization, salon] = await Promise.all([
    getBarberTodaySummary(prisma, session.barber.id),
    getBarberMonthlyCommission(prisma, session.barber.id),
    getBarberCommissionBalance(prisma, {
      organizationId: session.organizationId,
      barberId: session.barber.id,
    }),
    session.organizationId
      ? prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true } })
      : null,
    session.salonId
      ? prisma.salon.findUnique({ where: { id: session.salonId }, select: { name: true } })
      : null,
  ]);
  // اسم المؤسسة والفرع قد يتطابقان (مؤسسة بفرع واحد) — تكرارهما يبدو خطأ لا معلومة.
  const workplace = [...new Set([organization?.name, salon?.name].filter(Boolean))].join(" · ");
  const subscription = await getSubscriptionState(prisma, session.organizationId);
  const settings = await getEffectiveSettings(prisma, {
    organizationId: session.organizationId,
    salonId: session.salonId,
  });
  const barberExpenseLimit = settings ? Number(settings.barberExpenseLimit) : 0;
  const [sessionExpenses, openAttendance, nextDaysAppointments, stockProducts, stockReports, supplyItems] =
    await Promise.all([
    summary.cashSession ? getSessionExpenses(prisma, summary.cashSession.id) : Promise.resolve([]),
    getOpenAttendance(prisma, session.barber.id),
    // ثلاثة أيام لا يوم واحد: تنبيه حجز الغد كان يصل الحلاق ولا يجد له أثرًا في
    // شاشته، فيظنه عطلًا. المدى نفسه في `/api/barber/appointments` للتحديث الدوري.
    listAppointments(prisma, {
      organizationId: session.organizationId,
      salonIds: [session.salonId],
      barberId: session.barber.id,
      days: BARBER_APPOINTMENTS_DAYS,
    }),
    // مخزون فرعه كاملًا — بما نفد. قائمة البيع تخفي الناقص، وهذه تشرحه.
    listProducts(prisma, {
      organizationId: session.organizationId,
      salonIds: [session.salonId],
      onlyActive: true,
    }),
    listStockReports(prisma, {
      organizationId: session.organizationId,
      salonIds: [session.salonId],
      barberId: session.barber.id,
      take: 10,
    }),
    // مستلزمات تشغيلية: قناة بلاغ بحتة بلا سعر ولا كمية ولا أثر مالي.
    listSupplyItems(prisma, {
      organizationId: session.organizationId,
      salonIds: [session.salonId],
      onlyActive: true,
    }),
  ]);
  const upcomingAppointments = nextDaysAppointments.filter(
    (appointment) => appointment.status === "BOOKED" || appointment.status === "ARRIVED",
  );
  // شارة تبويب المخزون: ما يستدعي بلاغًا فعلًا — لا عدد المنتجات.
  const stockAttention =
    stockProducts.filter((product) => product.stockQuantity <= product.lowStockThreshold).length +
    supplyItems.filter((item) => item.status !== "AVAILABLE").length;

  /**
   * ترويسة ثابتة في كل التبويبات.
   *
   * الشارتان تحملان ما كان لوحين كاملين: مبلغ العهدة وحالة الجلسة. الحلاق يقرر
   * بهما ماذا يفعل الآن (يفتح جلسة؟ يسلّم كاشًا؟)، فلا يصحّ أن يحتاج فتح تبويب
   * ليعرفهما، ولا أن يشغلا نصف الشاشة الأولى برقمين بحجم بطولي.
   */
  const header = (
    <div className="sticky top-0 z-20 -mx-4 border-b border-salon-line bg-salon-mist/95 px-4 py-3 sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-11 w-11 shrink-0 border border-salon-line shadow-sm" priority />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold text-salon-forest">{workplace || "منصة إكس مانس إكس XMANSX"}</p>
            {/* الاسم يلتف على سطرين بدل أن يُقصّ: «مرحبًا حلاق تجر…» ليست تحية. */}
            <h1 className="text-lg font-bold leading-tight text-salon-ink sm:text-xl">مرحبًا {session.barber.name}</h1>
          </div>
        </div>
        <LogoutButton className="min-h-11 shrink-0 border-salon-line bg-white text-salon-charcoal shadow-sm hover:border-salon-forest/40" />
      </div>

      {subscription.blockReason ? null : (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="barber-status-chip">
            عهدتك <span className="lux-number text-sm text-salon-ink">{formatSar(summary.custodyBalance)}</span>
          </span>
          <span className={`barber-status-chip ${summary.cashSession ? "is-open" : "is-closed"}`}>
            <span aria-hidden="true" />
            {summary.cashSession ? "جلسة مفتوحة" : "لا توجد جلسة"}
          </span>
        </div>
      )}
    </div>
  );

  /** ما يُقرأ ولا يُفعل به شيء من هذه الشاشة: العمولة وحصيلة اليوم. */
  const moneyPanels = (
    <>
      {monthlyCommission ? (
        <section className="barber-card overflow-hidden">
          <div className="barber-card-head flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-salon-forest">مستحقات العمولة</p>
              <h2 className="mt-1 font-bold text-salon-ink">عمولة {monthlyCommission.monthLabel}</h2>
            </div>
            <span className="shrink-0 rounded-full border border-salon-line bg-white px-3 py-1 text-xs font-bold text-salon-forest">
              مفعّلة
            </span>
          </div>
          <div className="p-4">
            {/* الرقم البطولي هو المتبقي له لا ما اكتسبه: بعد أول صرف يصير
                المكتسب الخام رقمًا مضلّلًا يظن الحلاق أنه ما زال يستحقه. */}
            <p className="lux-number text-4xl text-salon-forest">{formatSar(commissionBalance.outstanding)}</p>
            <p className="mt-1 text-xs font-semibold text-salon-charcoal/65">
              المتبقي لك بعد ما استلمته · عمولة {monthlyCommission.monthLabel}{" "}
              {formatSar(monthlyCommission.commissionAmount)}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-salon-line pt-4 text-center">
              <CommissionTile label="مستحق تراكمي" value={formatSar(commissionBalance.accrued)} />
              <CommissionTile label="استلمته" value={formatSar(commissionBalance.paid)} />
              <CommissionTile label="النسبة الفعلية" value={`${monthlyCommission.effectiveRate}%`} />
            </div>
            {commissionBalance.payouts.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {commissionBalance.payouts.slice(0, 3).map((payout) => (
                  <li
                    key={payout.id}
                    className="flex items-baseline justify-between gap-3 rounded-xl border border-salon-line bg-salon-pearl px-3 py-2 text-xs font-semibold text-salon-charcoal"
                  >
                    <span className="min-w-0 truncate">
                      {new Date(payout.paidAt).toLocaleDateString("ar-SA", { timeZone: RIYADH_TIME_ZONE })} ·{" "}
                      {payout.methodLabel}
                      {payout.paidByName ? ` · ${payout.paidByName}` : ""}
                    </span>
                    <span className="lux-number shrink-0 text-salon-forest">{formatSar(payout.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-salon-line px-3 py-2.5 text-center text-[11px] font-semibold text-salon-charcoal/60">
                لم تستلم أي صرف عمولة بعد. كل صرف توثّقه الإدارة سيظهر هنا بمبلغه وطريقته.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {/* بطاقة واحدة لا بطاقتان: «لوحة العمل السريعة» و«آخر عملياتك» كانتا
          تعرضان صافي اليوم نفسه مرتين متتاليتين — رقم مكرر يقرأ كرقمين. */}
      <section className="barber-card overflow-hidden">
        <div className="barber-card-head">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-salon-charcoal/70">صافي عملياتك اليوم</p>
              <p className="lux-number mt-1 text-4xl text-salon-forest">{formatSar(summary.netTotal)}</p>
            </div>
            <div className="shrink-0 rounded-xl border border-salon-line bg-white px-5 py-3 text-center">
              <p className="lux-number text-2xl text-salon-ink">{summary.visitsCount}</p>
              <p className="text-xs font-bold text-salon-charcoal/65">زيارة</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SummaryTile label="كاش اليوم" value={formatSar(summary.cashTotal)} tone="gold" />
            <SummaryTile label="شبكة اليوم" value={formatSar(summary.networkTotal)} tone="steel" />
          </div>
        </div>
        <div className="space-y-2 p-4">
          {summary.latestVisits.map((visit) => (
            <div key={visit.id} className="rounded-xl border border-salon-line bg-salon-pearl px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{visit.customer.name}</span>
                <span className="lux-number text-salon-forest">{formatSar(visit.netAmount)}</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-salon-charcoal/75">
                {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"} ·{" "}
                {new Date(visit.visitedAt).toLocaleTimeString("ar-SA", {
                  timeZone: RIYADH_TIME_ZONE,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))}
          {summary.latestVisits.length === 0 ? (
            <p className="rounded-xl border border-dashed border-salon-line bg-salon-pearl py-5 text-center text-sm font-semibold text-salon-charcoal">
              لا توجد زيارات اليوم بعد
            </p>
          ) : null}
        </div>
      </section>
    </>
  );

  // اشتراك موقوف = لا تشغيل ولا تبويبات: يبقى ما يقرؤه الحلاق عن مستحقاته
  // ويومه، وتُرفع عنه كل أدوات العمل بدل عرضها معطّلة.
  if (subscription.blockReason) {
    return (
      <main className="barber-shell">
        <section className="barber-container is-app">
          {header}
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-900">
            <p className="text-base font-bold">التشغيل متوقف مؤقتًا</p>
            <p className="mt-1.5 text-sm font-semibold leading-6">{subscription.blockReason}</p>
            <p className="mt-2 text-xs font-bold">راجع مدير الصالون لتفعيل الاشتراك.</p>
          </div>
          <div className="mt-4 space-y-4">{moneyPanels}</div>
        </section>
      </main>
    );
  }

  const tabs: BarberTab[] = [
    {
      key: "work",
      label: "العمل",
      icon: "scissors",
      content: (
        <>
          {/* بلا جلسة صندوق: بطاقة الفتح أولًا ثم الزر المعطّل تحتها مباشرة.
              كان الزر المعطّل يسبقها ويحيل إلى «بطاقة جلسة الصندوق في هذه
              الصفحة» وهي خمسة ألواح أسفله بلا رابط — تعليمة بلا وجهة. وإخفاء
              الزر ليس بديلًا: يقرأ كعطل في التطبيق لا كقاعدة تشغيلية. */}
          {summary.cashSession ? (
            <>
              <Link
                href="/barber/visits/new"
                className="barber-gold-button flex h-16 w-full items-center justify-center text-xl"
              >
                + عملية جديدة
              </Link>
              <CustomerSearch />
            </>
          ) : null}

          <CashSessionPanel
            initialSession={summary.cashSession}
            initialExpenses={sessionExpenses}
            custodyBalance={summary.custodyBalance}
            custodyInitialized={summary.custodyInitialized}
            expenseLimit={barberExpenseLimit}
          />

          {summary.cashSession ? null : (
            <div>
              <button
                type="button"
                disabled
                className="barber-gold-button flex h-16 w-full items-center justify-center text-xl"
              >
                + عملية جديدة
              </button>
              <p className="mt-2 text-center text-xs font-bold text-salon-ruby">متوقّف حتى تفتح جلسة صندوق</p>
            </div>
          )}

          <AttendancePanel
            initialAttendance={
              openAttendance
                ? { id: openAttendance.id, checkInAt: openAttendance.checkInAt.toISOString(), isOpen: true }
                : null
            }
          />

          <BarberNotificationCenter />
        </>
      ),
    },
    {
      key: "appointments",
      label: "المواعيد",
      icon: "calendar",
      badge: upcomingAppointments.length,
      content: (
        <BarberAppointmentsPanel
          initialAppointments={upcomingAppointments}
          barberName={session.barber.name}
          salonName={salon?.name ?? organization?.name}
        />
      ),
    },
  ];

  if (stockProducts.length > 0 || supplyItems.length > 0) {
    tabs.push({
      key: "stock",
      label: "المخزون",
      icon: "adjustments",
      badge: stockAttention,
      alert: true,
      content: (
        <>
          {supplyItems.length > 0 ? (
            <BarberSuppliesPanel
              initialItems={supplyItems.map((item) => ({
                id: item.id,
                name: item.name,
                unit: item.unit,
                status: item.status,
                statusLabel: item.statusLabel,
                lastRestockedAt: item.lastRestockedAt,
                openReport: item.openReport,
              }))}
            />
          ) : null}

          {stockProducts.length > 0 ? (
            <BarberStockPanel
              products={stockProducts.map((product) => ({
                id: product.id,
                name: product.name,
                stockQuantity: product.stockQuantity,
                lowStockThreshold: product.lowStockThreshold,
              }))}
              initialReports={stockReports.map((report) => ({
                id: report.id,
                type: report.type,
                typeLabel: report.typeLabel,
                status: report.status,
                statusLabel: report.statusLabel,
                quantity: report.quantity,
                createdAt: report.createdAt,
                product: { id: report.product.id, name: report.product.name },
              }))}
            />
          ) : null}
        </>
      ),
    });
  }

  tabs.push({
    key: "day",
    label: "يومي",
    icon: "reports",
    content: (
      <>
        <BarberCustodyCard
          custodyBalance={summary.custodyBalance}
          custodyInitialized={summary.custodyInitialized}
          collections={summary.collections}
        />
        {moneyPanels}
        {/* مدخل التثبيت هنا لا في تبويب العمل: دعوةٌ تعترض شاشة البيع تؤخّر
            الحلاق، وهذا تبويب لا يُفتح أثناء الخدمة. ويختفي متى كان مثبّتًا. */}
        <BarberInstallCard />
      </>
    ),
  });

  return (
    <main className="barber-shell">
      <section className="barber-container is-app">
        {header}

        {subscription.warning ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {subscription.warning}
          </div>
        ) : null}

        <BarberHomeTabs tabs={tabs} />
      </section>
    </main>
  );
}

function CommissionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-salon-line bg-salon-pearl px-2 py-2.5">
      <p className="lux-number text-base text-salon-ink">{value}</p>
      <p className="text-[11px] font-bold text-salon-charcoal/65">{label}</p>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "gold" | "steel" }) {
  return (
    <div className={`rounded-2xl border p-3 text-center ${tone === "gold" ? "border-salon-gold/40 bg-salon-gold/15" : "border-salon-steel/25 bg-salon-steel/10"}`}>
      <p className="text-xs font-semibold text-salon-charcoal/70">{label}</p>
      <p className="mt-1 text-lg font-bold text-salon-ink">{value}</p>
    </div>
  );
}

function formatSar(amount: number) {
  return `${formatMoney(amount)} ر.س`;
}
