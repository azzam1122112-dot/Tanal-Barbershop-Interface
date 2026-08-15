import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceReceipt } from "@/components/receipt/invoice-receipt";
import { getPortalIdentity } from "@/lib/customers/portal-view";
import { prisma } from "@/lib/db/prisma";
import { isBusinessError } from "@/lib/errors";
import { buildReceipt } from "@/lib/invoicing/receipt";

export const metadata: Metadata = { title: "إيصال الزيارة" };

export default async function CustomerVisitReceiptPage({
  params,
}: {
  params: Promise<{ token: string; visitId: string }>;
}) {
  const { token, visitId } = await params;
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  try {
    const receipt = await buildReceipt(prisma, visitId, {
      organizationId: identity.organizationId,
      customerId: identity.customer.id,
    });
    const receiptHref = `/my/${token}/visits/${visitId}`;
    return (
      <InvoiceReceipt
        receipt={receipt}
        backHref={`/my/${token}/visits`}
        pdfPath={`/api/my/${token}/visits/${visitId}/pdf`}
        receiptHref={receiptHref}
        embedded
      />
    );
  } catch (error) {
    if (isBusinessError(error) && error.status === 404) notFound();
    throw error;
  }
}
