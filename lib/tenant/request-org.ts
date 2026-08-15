import { headers } from "next/headers";
import { extractOrgSlug } from "./subdomain";

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
