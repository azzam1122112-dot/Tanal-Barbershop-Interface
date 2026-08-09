import { notFound, redirect } from "next/navigation";
import { InvoiceReceipt } from "@/components/receipt/invoice-receipt";
import { getRequestSession } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { isBusinessError } from "@/lib/errors";
import { buildReceipt } from "@/lib/invoicing/receipt";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");

  const { id } = await params;

  // الحلاق يطبع إيصالات زياراته هو؛ الإدارة تطبع إيصالات فروعها المسموح بها.
  const scope =
    session.type === "barber"
      ? { organizationId: session.organizationId, salonIds: [session.salonId], barberId: session.barber.id }
      : session.type === "dashboard"
        ? { organizationId: session.organizationId, salonIds: effectiveSalonIds(session) }
        : null;

  if (!scope) redirect("/dashboard/login");

  try {
    const receipt = await buildReceipt(prisma, id, scope);
    return <InvoiceReceipt receipt={receipt} backHref={session.type === "barber" ? "/barber" : "/dashboard/visits"} />;
  } catch (error) {
    if (isBusinessError(error) && error.status === 404) notFound();
    throw error;
  }
}
