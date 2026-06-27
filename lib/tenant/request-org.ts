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

/**
 * يحلّ المؤسسة لطلب الدخول: النطاق الفرعي أولاً (إن وُجد)، وإلا المعرّف المُدخل
 * من نموذج الدخول، وإلا المؤسسة الافتراضية. هذا يتيح الدخول على نطاق واحد
 * (بلا wildcard DNS) عبر إدخال معرّف المؤسسة.
 */
export async function resolveOrganizationForLogin(explicitSlug?: string | null) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const hostSlug = extractOrgSlug(host);
  const slug = hostSlug ?? (explicitSlug?.trim().toLowerCase() || null);

  if (slug) {
    return prisma.organization.findUnique({ where: { slug } });
  }

  return prisma.organization.findFirst({ where: { slug: "default" } });
}
