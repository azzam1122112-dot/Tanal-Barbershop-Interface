import type { AppointmentStatus } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

export const MAX_BOOKING_NO_SHOWS = 2;
export const BOOKING_BLOCK_REASON = "عدم الحضور لموعدين محجوزين";

export type CustomerBookingDiscipline = {
  bookingNoShowCount: number;
  bookingBlockedAt: Date | null;
  bookingBlockReason?: string | null;
};

export function toCustomerBookingPolicy(customer: CustomerBookingDiscipline) {
  const noShowCount = Math.max(0, customer.bookingNoShowCount);
  return {
    noShowCount,
    maxNoShows: MAX_BOOKING_NO_SHOWS,
    remainingBeforeBlock: Math.max(0, MAX_BOOKING_NO_SHOWS - noShowCount),
    blocked: Boolean(customer.bookingBlockedAt) || noShowCount >= MAX_BOOKING_NO_SHOWS,
    blockedAt: customer.bookingBlockedAt?.toISOString() ?? null,
    reason: customer.bookingBlockReason ?? null,
  };
}

/** بوابة الخادم النهائية: تغيير الواجهة أو صنع طلب يدوي لا يتجاوز الحظر. */
export function assertCustomerBookingAllowed(customer: CustomerBookingDiscipline) {
  const policy = toCustomerBookingPolicy(customer);
  if (policy.blocked) {
    throw new BusinessError(
      "تم تعليق الحجز الإلكتروني بعد عدم الحضور لموعدين. تواصل مع الصالون لإعادة تفعيل الحجز.",
      403,
    );
  }
}

/**
 * يحسب أثر تصنيف الموعد أو تصحيحه. الانتقال إلى NO_SHOW يزيد المخالفة مرة واحدة،
 * والخروج منها ينقصها؛ لذلك لا يتضاعف العدّاد عند تكرار الطلب نفسه.
 */
export function nextBookingDisciplineState(
  customer: CustomerBookingDiscipline,
  previousStatus: AppointmentStatus,
  nextStatus: AppointmentStatus,
  now = new Date(),
) {
  const enteredNoShow = previousStatus !== "NO_SHOW" && nextStatus === "NO_SHOW";
  const correctedNoShow = previousStatus === "NO_SHOW" && nextStatus !== "NO_SHOW";
  if (!enteredNoShow && !correctedNoShow) return null;

  const noShowCount = Math.max(
    0,
    customer.bookingNoShowCount + (enteredNoShow ? 1 : -1),
  );
  const blocked = noShowCount >= MAX_BOOKING_NO_SHOWS;

  return {
    bookingNoShowCount: noShowCount,
    bookingBlockedAt: blocked ? customer.bookingBlockedAt ?? now : null,
    bookingBlockReason: blocked ? BOOKING_BLOCK_REASON : null,
  };
}
