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
 * معرّف المؤسسة المستنتج من **النطاق الفرعي فقط**.
 * يرجع null على نطاق موحّد أو محليًا — عندها يُحلّ المستأجر من هوية المستخدم
 * (البريد/الجوال) وبيانات اعتماده، فلا يُطلب منه كتابة معرّف مؤسسة أبدًا.
 */
export async function getKnownLoginOrgSlug() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  return extractOrgSlug(host);
}
