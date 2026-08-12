import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/dashboard/ui";
import { ActivityList, BranchList } from "@/components/public/wallet-cards";
import { OpenPortalButton } from "@/components/public/open-portal-button";
import { getRequestCustomerSession } from "@/lib/customers/account-http";
import { getCustomerOrganizationLoyalty } from "@/lib/customers/loyalty-wallet";
import { prisma } from "@/lib/db/prisma";
import { formatNumber, formatRelativeDay } from "@/lib/format";

/**
 * بطاقة مؤسسة واحدة.
 *
 * **الملكية مفروضة في الاستعلام لا بعده**: الخدمة تقيّد بـ `accountId` من أول
 * `where`، فبطاقة حساب آخر لا تُجلب أصلًا وتعود 404 بلا كشف وجودها.
 */
export default async function LoyaltyCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getRequestCustomerSession();
  if (!session) redirect("/account/login");

  const [{ reference }, { page }] = await Promise.all([params, searchParams]);
  const card = await getCustomerOrganizationLoyalty(prisma, session.account.id, reference, {
    page: Number.parseInt(page ?? "1", 10) || 1,
  });
  if (!card) notFound();

  const totalPages = Math.max(1, Math.ceil(card.activity.total / card.activity.pageSize));

  return (
    <section className="space-y-4">
      <Link href="/account/loyalty" className="inline-block text-sm font-bold text-salon-charcoal/70">
        → كل البطاقات
      </Link>

      <div className="barber-card p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-lg font-bold leading-7 text-salon-ink">{card.organizationName}</h1>
          {card.organizationActive ? null : <Badge tone="warning">غير متاحة حاليًا</Badge>}
        </div>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="lux-number text-4xl font-black text-salon-ink">{formatNumber(card.points)}</span>
          <span className="text-sm font-bold text-salon-charcoal/60">نقطة</span>
        </p>
        {/* عمودان دائمًا. `sm:grid-cols-4` كانت تُقسّم عمود الحساب الضيّق إلى
            أربعة بعرض ~85px لتسميات مثل «إجمالي المستبدل» — أضيق شبكة رباعية
            في المشروع. 2×2 تعطي الرقم مساحته وتسميتَه سطرًا واحدًا. */}
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-salon-line/70 pt-4">
          <Fact label="إجمالي المكتسب" value={formatNumber(card.lifetimeEarned)} />
          <Fact label="إجمالي المستبدل" value={formatNumber(card.lifetimeRedeemed)} />
          <Fact label="الزيارات" value={formatNumber(card.visitCount)} />
          <Fact label="آخر نشاط" value={formatRelativeDay(card.lastActivityAt)} />
        </dl>

        {/* الإجراء داخل بطاقة الترويسة لا لوحًا رابعًا أسفل الصفحة: هذه صفحة
            قراءة (أرصدة وفروع وسجل)، والفعل الوحيد فيها يجب أن يُرى بلا تمرير.
            ولا يُعرض لمؤسسة موقوفة — الخادم يرفضه أصلًا. */}
        {card.organizationActive ? (
          <div className="mt-5 border-t border-salon-line/70 pt-5">
            <OpenPortalButton reference={card.reference} />
          </div>
        ) : null}
      </div>

      {card.rewards.length > 0 ? (
        <Panel title="المكافآت المتاحة">
          <ul className="space-y-2.5">
            {card.rewards.map((reward) => (
              <li key={reward.id} className="flex items-baseline justify-between gap-3 rounded-xl bg-salon-mist/60 px-3.5 py-3">
                <span className="min-w-0 text-sm font-bold text-salon-ink">{reward.name}</span>
                <span className={`shrink-0 text-xs font-bold ${reward.reachable ? "text-salon-forest" : "text-salon-charcoal/55"}`}>
                  {formatNumber(reward.requiredPoints)} نقطة
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-medium leading-6 text-salon-charcoal/55">
            تُصرف المكافأة في الصالون عند زيارتك القادمة.
          </p>
        </Panel>
      ) : null}

      <Panel title="الفروع التي زرتها">
        <BranchList branches={card.branches} />
      </Panel>

      <Panel title="سجل النقاط">
        <ActivityList entries={card.activity.entries} />
        {totalPages > 1 ? (
          <nav className="mt-4 flex items-center justify-between gap-3 border-t border-salon-line/70 pt-3.5" aria-label="تصفّح السجل">
            <PageLink reference={card.reference} page={card.activity.page - 1} disabled={card.activity.page <= 1}>
              الأحدث
            </PageLink>
            <span className="text-xs font-semibold text-salon-charcoal/55">
              صفحة {formatNumber(card.activity.page)} من {formatNumber(totalPages)}
            </span>
            <PageLink reference={card.reference} page={card.activity.page + 1} disabled={card.activity.page >= totalPages}>
              الأقدم
            </PageLink>
          </nav>
        ) : null}
      </Panel>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-sm font-bold text-salon-ink">{value}</dd>
      <dt className="mt-0.5 text-[11px] font-semibold text-salon-charcoal/55">{label}</dt>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  // كانت بلا ظل بينما بطاقة الترويسة فوقها لها ظل — سطحان بلغتين على شاشة واحدة.
  return (
    <section className="barber-card p-5">
      <h2 className="mb-3.5 text-sm font-bold text-salon-ink">{title}</h2>
      {children}
    </section>
  );
}

function PageLink({ reference, page, disabled, children }: { reference: string; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <span className="text-xs font-bold text-salon-charcoal/30">{children}</span>;
  }
  return (
    <Link href={`/account/loyalty/${encodeURIComponent(reference)}?page=${page}`} className="text-xs font-bold text-salon-ink underline">
      {children}
    </Link>
  );
}
