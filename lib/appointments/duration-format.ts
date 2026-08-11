/**
 * صياغة مدة الموعد ووقت انتهائه — عرض فقط، بلا أي وصول للقاعدة.
 *
 * ملف مستقل عن `appointment-duration.ts` عمدًا: هذا يُستورَد في مكوّنات العميل،
 * وذاك يحمل منطق القاعدة والأخطاء.
 */

import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";

/** «90» → «ساعة ونصف». الرقم المجرّد لا يُقرأ، و«1.5 ساعة» ليست عربية. */
export function formatDurationLabel(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (hours === 0) return `${rest} دقيقة`;
  const hourLabel = hours === 1 ? "ساعة" : hours === 2 ? "ساعتان" : `${hours} ساعات`;
  if (rest === 0) return hourLabel;
  if (rest === 30) return `${hourLabel} ونصف`;
  return `${hourLabel} و${rest} دقيقة`;
}

const clockFormatter = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  timeZone: RIYADH_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

export function appointmentEndAt(startAt: string | Date, durationMinutes: number) {
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  return new Date(start.getTime() + durationMinutes * 60_000);
}

/**
 * «5:30 – 7:00 م · ساعة ونصف».
 *
 * المدى لا الخانة: العميل الذي يرى «5:30» وحدها يظن أنه ينصرف في السادسة،
 * والحلاق الذي يرى الوقت بلا نهايته لا يعرف متى يحرّر كرسيه.
 */
export function formatAppointmentSpan(startAt: string | Date, durationMinutes: number) {
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  const end = appointmentEndAt(start, durationMinutes);
  return `${clockFormatter.format(start)} – ${clockFormatter.format(end)}`;
}
