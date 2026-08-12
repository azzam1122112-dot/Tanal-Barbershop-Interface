import { describe, expect, it } from "vitest";
import { getSupportAvailability, supportMailtoLink, supportTelLink } from "../lib/legal-contact";
import { legalInfo } from "../lib/legal";
import { riyadhDateTimeForDay, startOfRiyadhDay, addRiyadhDays, getRiyadhWeekday } from "../lib/datetime/riyadh";

/** يوم رياض بيومه المطلوب من الأسبوع (0 = الأحد) وبدقيقة محدّدة. */
function riyadhAt(weekday: number, minuteOfDay: number) {
  const base = startOfRiyadhDay(new Date("2026-08-12T09:00:00.000Z"));
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const day = addRiyadhDays(base, ahead);
    if (getRiyadhWeekday(day) === weekday) return riyadhDateTimeForDay(day, minuteOfDay);
  }
  throw new Error("weekday not found");
}

describe("توفّر الدعم وقنوات التواصل", () => {
  it("متاح داخل ساعات العمل في يوم عمل", () => {
    const state = getSupportAvailability(riyadhAt(1, 11 * 60)); // الإثنين 11 صباحًا
    expect(state.open).toBe(true);
    expect(state.label).toBe("متاح الآن");
  });

  it("قبل التاسعة في يوم عمل: يبدأ الرد اليوم نفسه", () => {
    const state = getSupportAvailability(riyadhAt(1, 7 * 60));
    expect(state.open).toBe(false);
    expect(state.nextOpenLabel).toBe("اليوم 9 صباحًا");
  });

  it("بعد السادسة مساءً: يُحال لأقرب يوم عمل", () => {
    const state = getSupportAvailability(riyadhAt(1, 20 * 60)); // الإثنين 8 مساءً
    expect(state.open).toBe(false);
    expect(state.nextOpenLabel).toBe("غدًا 9 صباحًا");
  });

  it("الجمعة والسبت خارج الدوام، والرد يبدأ الأحد", () => {
    const friday = getSupportAvailability(riyadhAt(5, 12 * 60));
    const saturday = getSupportAvailability(riyadhAt(6, 12 * 60));
    expect(friday.open).toBe(false);
    expect(saturday.open).toBe(false);
    expect(saturday.nextOpenLabel).toBe("غدًا 9 صباحًا");
    expect(friday.nextOpenLabel).toBe("الأحد 9 صباحًا");
  });

  it("رابط الاتصال بصيغة دولية صالحة", () => {
    expect(supportTelLink()).toBe("tel:+966537720207");
  });

  it("رابط البريد يحمل التصنيف ونموذجًا وتحذير عدم إرسال الأسرار", () => {
    const link = supportMailtoLink("[شكوى] ");
    expect(link.startsWith(`mailto:${legalInfo.supportEmail}?subject=`)).toBe(true);
    const decoded = decodeURIComponent(link);
    expect(decoded).toContain("[شكوى]");
    expect(decoded).toContain("اسم الصالون:");
    expect(decoded).toContain("لا ترسل كلمة المرور");
  });

  it("بريد الخصوصية هو البريد الموحّد نفسه", () => {
    expect(legalInfo.privacyEmail).toBe(legalInfo.supportEmail);
  });
});
