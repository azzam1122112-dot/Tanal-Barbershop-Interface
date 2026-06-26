import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { extractOrgSlug } from "./subdomain";

/**
 * يحلّ المؤسسة الحالية من النطاق الفرعي للطلب.
 * بلا نطاق فرعي (محلي/جذر) يرجع المؤسسة الافتراضية لتوافق التطوير وأحادي المستأجر.
 */
export async function resolveRequestOrganization() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const slug = extractOrgSlug(host);

  if (slug) {
    return prisma.organization.findUnique({ where: { slug } });
  }

  return prisma.organization.findFirst({ where: { slug: "default" } });
}
