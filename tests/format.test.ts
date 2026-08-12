import { describe, expect, it } from "vitest";
import { countAr, formatAmount, formatDate, formatMoney, formatNumber, formatPercent, formatRelativeDay, pluralizeAr } from "../lib/format";

/** الأرقام الهندية ٠-٩ — وجودها في المخرجات هو العيب الذي نمنعه. */
const ARABIC_INDIC = /[٠-٩]/;

describe("توحيد الأرقام على النظام اللاتيني", () => {
  it("لا يُخرج رقمًا هنديًا في المبالغ", () => {
    expect(formatMoney(0)).toBe("0 ريال");
    expect(formatMoney(1240.5)).not.toMatch(ARABIC_INDIC);
    expect(formatAmount(1240.5)).not.toMatch(ARABIC_INDIC);
  });

  it("يعرض الصفر رقمًا مقروءًا لا نقطة", () => {
    // `٠` كانت تُرسم نقطة صغيرة فتبدو بيانات مفقودة في لوحة الحلاق.
    expect(formatAmount(0)).toBe("0");
    expect(formatNumber(0)).toBe("0");
  });

  it("يوحّد العدّادات مع المبالغ في نظام واحد", () => {
    expect(formatNumber(1500)).not.toMatch(ARABIC_INDIC);
    expect(formatMoney(1500)).not.toMatch(ARABIC_INDIC);
  });

  it("يقصّ الكسور في العدّادات ويُبقيها في المبالغ", () => {
    expect(formatNumber(12.7)).toBe("13");
    expect(formatAmount(12.75)).toBe("12.75");
  });

  it("لا يُخرج رقمًا هنديًا في التواريخ والنسب", () => {
    expect(formatDate("2026-08-06T00:00:00.000Z")).not.toMatch(ARABIC_INDIC);
    expect(formatPercent(15)).toBe("15%");
  });

  it("يعيد شرطة للتاريخ الفارغ", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
  });
});

describe("التاريخ القريب «اليوم/أمس»", () => {
  // 08:00 بتوقيت الرياض = 05:00 UTC.
  const now = new Date("2026-08-13T05:00:00.000Z");

  it("يعدّ ما بعد منتصف ليل الرياض من اليوم نفسه لا من أمس", () => {
    // 01:30 فجرًا بالرياض = 22:30 UTC من اليوم السابق. القسمة على يوم UTC كانت
    // تضع هذه الحركة في «أمس» بينما صاحبها يقرأها في صباح يومها.
    expect(formatRelativeDay("2026-08-12T22:30:00.000Z", now)).toBe("اليوم");
  });

  it("يميّز أمس بحدود يوم الرياض", () => {
    expect(formatRelativeDay("2026-08-12T10:00:00.000Z", now)).toBe("أمس");
    // 00:30 بالرياض من يوم 12 = 21:30 UTC من يوم 11 — ما زال «أمس».
    expect(formatRelativeDay("2026-08-11T21:30:00.000Z", now)).toBe("أمس");
  });

  it("يعود للتاريخ الكامل بأرقام لاتينية فيما هو أقدم", () => {
    const older = formatRelativeDay("2026-08-01T10:00:00.000Z", now);
    expect(older).toBe(formatDate("2026-08-01T10:00:00.000Z"));
    // نفس عيب `ar-SA` الخام: «١ أغسطس» بجوار «1,240 نقطة» في البطاقة الواحدة.
    expect(older).not.toMatch(ARABIC_INDIC);
  });

  it("يعيد شرطة طويلة للتاريخ الفارغ", () => {
    expect(formatRelativeDay(null, now)).toBe("—");
  });
});

describe("صيغ الجمع العربية", () => {
  const CUSTOMER = { one: "عميل واحد", two: "عميلان", few: "عملاء", many: "عميلًا" };

  it("يختار الصيغة حسب قواعد العربية لا الإنجليزية", () => {
    expect(pluralizeAr(1, CUSTOMER)).toBe("عميل واحد");
    expect(pluralizeAr(2, CUSTOMER)).toBe("عميلان");
    expect(pluralizeAr(3, CUSTOMER)).toBe("عملاء");
    expect(pluralizeAr(10, CUSTOMER)).toBe("عملاء");
    expect(pluralizeAr(11, CUSTOMER)).toBe("عميلًا");
    expect(pluralizeAr(100, CUSTOMER)).toBe("عميلًا");
  });

  it("يبني عبارة عدّ كاملة بلا رقم زائد للمفرد والمثنى", () => {
    expect(countAr(1, CUSTOMER)).toBe("عميل واحد");
    expect(countAr(2, CUSTOMER)).toBe("عميلان");
    expect(countAr(3, CUSTOMER)).toBe("3 عملاء");
    expect(countAr(14, CUSTOMER)).toBe("14 عميلًا");
  });

  it("يتعامل مع الصفر كصيغة الجمع الكثير", () => {
    expect(countAr(0, CUSTOMER)).toBe("0 عميلًا");
  });
});
