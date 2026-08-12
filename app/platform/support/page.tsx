import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformSupportInbox } from "@/components/platform/platform-support-inbox";
import { prisma } from "@/lib/db/prisma";
import { getPlatformSupportInbox, getSupportConfiguration } from "@/lib/email/platform-support";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlatformSupportPage() {
  const inbox = await getPlatformSupportInbox(prisma);
  const inbound = getSupportConfiguration();

  return (
    <PlatformShell
      active="support"
      title="صندوق دعم العملاء"
      description="استقبل رسائل العملاء ورد عليها من عنوان إكس مانس إكس XMANSX الرسمي، مع تعيين المسؤول والأولوية وتتبع حالة كل محادثة."
      actions={(
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${inbound.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <span className={`h-2 w-2 rounded-full ${inbound.enabled ? "bg-emerald-500" : "bg-amber-500"}`} />
          {inbound.enabled ? "الاستقبال متصل" : "بانتظار ربط الإنتاج"}
        </span>
      )}
    >
      <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SupportMetric label="غير مقروءة" value={inbox.stats.unread} tone="danger" />
        <SupportMetric label="مفتوحة" value={inbox.stats.open} tone="warning" />
        <SupportMetric label="بانتظار العميل" value={inbox.stats.pending} tone="neutral" />
        <SupportMetric label="تم حلها" value={inbox.stats.resolved} tone="success" />
      </section>
      <PlatformSupportInbox initialData={inbox} />
    </PlatformShell>
  );
}

function SupportMetric({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "success" | "neutral" }) {
  const accent = tone === "danger" ? "bg-red-500" : tone === "warning" ? "bg-amber-500" : tone === "success" ? "bg-emerald-500" : "bg-salon-gold";
  return (
    <div className="dashboard-panel relative overflow-hidden px-4 py-4">
      <span className={`absolute inset-y-0 right-0 w-1 ${accent}`} />
      <p className="text-xs font-semibold text-salon-charcoal">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums text-salon-ink">{formatNumber(value)}</p>
    </div>
  );
}
