import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Campaign } from "@prisma/client";
import { qualifiesForCampaign } from "../lib/campaigns/campaign-eligibility";
import { toCustomerCampaignOffer } from "../lib/campaigns/campaign-offer";

/**
 * رحلة العميل: ما يستحقه يجب أن يصل إليه.
 *
 * تبويب «العروض» في بوابة العميل كان يَعِد بعروض ويعرض المكافآت وقائمة الأسعار
 * فقط — لأن الأهلية الكاملة تطلب `grossAmount` ولا مبلغ وقت فتح البوابة. فيُعدّ
 * الصالون حملةً محدودةً بفترة ولا يعلم بها صاحبُ الشأن إلا إن ذكرها له الحلاق
 * مصادفةً عند الدفع.
 */

const now = new Date("2026-08-13T10:00:00.000Z");

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    organizationId: "org_1",
    name: "استرجاع المنقطعين",
    description: null,
    discountType: "PERCENTAGE",
    discountValue: 15 as unknown as Campaign["discountValue"],
    targetType: "ALL_CUSTOMERS",
    inactiveDays: null,
    minPoints: null,
    startAt: new Date("2026-08-01T00:00:00.000Z"),
    endAt: new Date("2026-08-31T23:59:59.000Z"),
    maxUsesPerCustomer: 1,
    isActive: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  } as Campaign;
}

const customer = { id: "cus_1", visitCount: 4, lastVisitAt: new Date("2026-08-01T00:00:00.000Z"), loyaltyAccount: { points: 120 } };

/** بديل Prisma: التأهيل يحتاج عدّ استبدالات العميل لهذه الحملة فقط. */
function prismaWithRedemptions(count: number) {
  return { campaignRedemption: { count: async () => count } } as never;
}

describe("تأهيل الحملة بلا مبلغ", () => {
  it("يؤهّل حملة سارية ومستهدِفة ولم تُستنفد", async () => {
    const result = await qualifiesForCampaign({
      prisma: prismaWithRedemptions(0),
      campaign: campaign(),
      customer,
      now,
    });
    expect(result.qualified).toBe(true);
  });

  it("لا يعتمد على مبلغ الزيارة إطلاقًا", async () => {
    // جوهر الانفصال: لا `grossAmount` في التوقيع. اختلاق مبلغ وهمي كان سيُظهر
    // للعميل خصمًا برقم لن يحصل عليه.
    const source = readFileSync(join(process.cwd(), "lib", "campaigns", "campaign-eligibility.ts"), "utf8");
    const signature = source.match(/export async function qualifiesForCampaign\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(signature).not.toContain("grossAmount");
  });

  it("يرفض خارج النافذة وغير الفعّالة والمستنفدة وغير المستهدَفة", async () => {
    const cases: Array<[string, Parameters<typeof qualifiesForCampaign>[0]]> = [
      ["غير فعّالة", { prisma: prismaWithRedemptions(0), campaign: campaign({ isActive: false }), customer, now }],
      [
        "قبل البداية",
        { prisma: prismaWithRedemptions(0), campaign: campaign({ startAt: new Date("2026-09-01T00:00:00.000Z") }), customer, now },
      ],
      [
        "بعد النهاية",
        { prisma: prismaWithRedemptions(0), campaign: campaign({ endAt: new Date("2026-08-02T00:00:00.000Z") }), customer, now },
      ],
      ["استُنفدت", { prisma: prismaWithRedemptions(1), campaign: campaign({ maxUsesPerCustomer: 1 }), customer, now }],
      [
        "استهداف الجدد وللعميل زيارات",
        { prisma: prismaWithRedemptions(0), campaign: campaign({ targetType: "NEW_CUSTOMERS" }), customer, now },
      ],
      [
        "استهداف بحد نقاط أعلى من رصيده",
        {
          prisma: prismaWithRedemptions(0),
          campaign: campaign({ targetType: "CUSTOMERS_WITH_MIN_POINTS", minPoints: 500 }),
          customer,
          now,
        },
      ],
    ];

    for (const [label, input] of cases) {
      const result = await qualifiesForCampaign(input);
      expect(result.qualified, label).toBe(false);
    }
  });

  it("الزيارة تبقى على الشقّين: فحص المبلغ لم يُحذف", async () => {
    // انفصال التأهيل لا يعني تخفيف ما تفحصه الزيارة — الخصم الأكبر من الفاتورة
    // والخصم الصفري ما زالا مرفوضين هناك.
    const source = readFileSync(join(process.cwd(), "lib", "campaigns", "campaign-eligibility.ts"), "utf8");
    // من بداية الدالة إلى التصريح الذي يليها — لا `\n}` الأول فهو إغلاق الوسائط.
    const start = source.indexOf("async function evaluateCampaignEligibility");
    const full = source.slice(start, source.indexOf("function isTargetMatch", start));
    expect(full).toContain("qualifiesForCampaign");
    expect(full).toContain("قيمة الخصم أكبر من مبلغ الزيارة");
    expect(full).toContain("قيمة خصم الحملة غير صالحة");
  });
});

describe("صياغة العرض للعميل", () => {
  it("لا تعرض اسم الحملة الداخلي ولا سبب الاستهداف", () => {
    // «استرجاع المنقطعين» يصف الشريحة لا العرض: عرضه يخبر العميل بتصنيفه.
    const offer = toCustomerCampaignOffer(campaign({ targetType: "INACTIVE_CUSTOMERS", inactiveDays: 60 }));
    const rendered = JSON.stringify(offer);

    expect(rendered).not.toContain("استرجاع المنقطعين");
    expect(rendered).not.toContain("INACTIVE_CUSTOMERS");
    expect(rendered).not.toContain("60");
    expect(offer).not.toHaveProperty("name");
    expect(offer).not.toHaveProperty("targetType");
    expect(offer.title).toBeNull();
  });

  it("يعرض الاسم التسويقي للحملة العامة فقط", () => {
    expect(toCustomerCampaignOffer(campaign({ name: "عرض العودة للمدارس", targetType: "ALL_CUSTOMERS" })).title).toBe(
      "عرض العودة للمدارس",
    );
    expect(
      toCustomerCampaignOffer(campaign({ name: "استرجاع المنقطعين", targetType: "INACTIVE_CUSTOMERS", inactiveDays: 60 })).title,
    ).toBeNull();
  });

  it("العنوان مشتقّ من قيمة الخصم", () => {
    expect(toCustomerCampaignOffer(campaign()).headline).toBe("خصم 15٪");
    expect(
      toCustomerCampaignOffer(
        campaign({ discountType: "FIXED_AMOUNT", discountValue: 20 as unknown as Campaign["discountValue"] }),
      ).headline,
    ).toBe("خصم 20 ريال");
    // ‏«١٥» لا «١٥.٠٠»
    expect(
      toCustomerCampaignOffer(campaign({ discountValue: 12.5 as unknown as Campaign["discountValue"] })).headline,
    ).toBe("خصم 12.5٪");
  });

  it("النسبة تُعلَن نسبةً ولا تُترجم إلى ريالات بلا فاتورة", () => {
    expect(toCustomerCampaignOffer(campaign()).isPercentage).toBe(true);
    expect(
      toCustomerCampaignOffer(
        campaign({ discountType: "FIXED_AMOUNT", discountValue: 20 as unknown as Campaign["discountValue"] }),
      ).isPercentage,
    ).toBe(false);
  });

  it("الشرح يأتي من وصف المدير، والفارغ لا يُعرض سطرًا فارغًا", () => {
    expect(toCustomerCampaignOffer(campaign({ description: "  خصم الصيف على كل الخدمات " })).detail).toBe(
      "خصم الصيف على كل الخدمات",
    );
    expect(toCustomerCampaignOffer(campaign({ description: "   " })).detail).toBeNull();
    expect(toCustomerCampaignOffer(campaign({ description: null })).detail).toBeNull();
  });
});

describe("العروض تصل إلى شاشتَي العميل", () => {
  const offersPage = readFileSync(join(process.cwd(), "app", "my", "[token]", "offers", "page.tsx"), "utf8");
  const cardPage = readFileSync(join(process.cwd(), "app", "my", "[token]", "page.tsx"), "utf8");
  const loader = readFileSync(join(process.cwd(), "lib", "customers", "portal-view.ts"), "utf8");

  it("محمّل العروض يجلب الحملات المؤهَّلة", () => {
    expect(loader).toContain("listQualifiedCampaigns");
    expect(loader).toContain("qualifiedCampaigns");
  });

  it("الحملات ضمن Promise.all لا بانتظار متسلسل بعدها", () => {
    // انتظارها على حدة يضيف رحلتها كاملةً إلى زمن الصفحة.
    expect(loader).not.toMatch(/\]\);\s*\n\s*const qualifiedCampaigns = await listQualifiedCampaigns/);
  });

  it("تبويب العروض يعرضها بتاريخ انتهائها", () => {
    expect(offersPage).toContain("عروض سارية الآن");
    expect(offersPage).toContain("campaign.headline");
    expect(offersPage).toContain("campaign.endsAt");
  });

  it("«بطاقتي» تشير إلى أقرب عرض ينتهي", () => {
    // سطر عام («عروض الصالون») يجعل العرض الذي ينتهي بعد يومين يمرّ دون فتح.
    expect(cardPage).toContain("soonestCampaignEndsAt");
  });

  it("قاعدة «خصم واحد لكل زيارة» تُقال حين يصير للعميل أكثر من خصم", () => {
    // من يرى هديةً وعرضًا ومكافأتين يفترض أنها تُجمع، ثم يُطبَّق واحد عند الدفع.
    expect(offersPage).toContain("redeemableCount");
    expect(offersPage).toContain("خصم واحد");
  });
});

describe("رابط البطاقة المنتهي لا يقود إلى شاشات الموظفين", () => {
  const portalNotFound = readFileSync(join(process.cwd(), "app", "my", "not-found.tsx"), "utf8");

  it("لبوابة العميل حدّ «غير موجود» خاص بها", () => {
    // الرمز ينتهي بعد PORTAL_TOKEN_TTL_DAYS، وكان `notFound()` يهبط بصاحب
    // الرصيد على 404 العامة ومخارجُها «شاشة الحلاق» و«الإدارة».
    expect(portalNotFound).toContain("رابط بطاقتك لم يعد صالحًا");
  });

  it("يطمئن على الرصيد ويعطي طريقًا للاستعادة", () => {
    expect(portalNotFound).toContain("محفوظة كما هي");
    expect(portalNotFound).toContain("/account/loyalty");
    // ومن سجّله الحلاق ولا حساب له لا يُرسَل إلى شاشة دخول لا يملكها.
    expect(portalNotFound).toContain("ليس لديك حساب على المنصّة");
  });

  it("لا يعرض على العميل مخارج الموظفين", () => {
    expect(portalNotFound).not.toContain("/barber");
    expect(portalNotFound).not.toContain("/dashboard");
  });

  it("لا يُفهرس", () => {
    expect(portalNotFound).toContain("PRIVATE_ROBOTS");
  });
});

describe("إلغاء الموعد يُعلن نتيجته", () => {
  const booking = readFileSync(join(process.cwd(), "components", "public", "portal-booking.tsx"), "utf8");

  it("النجاح لم يعد اختفاءَ صفٍّ بلا كلمة", () => {
    expect(booking).toContain("appointmentNotice");
    expect(booking).toContain("الوقت متاح للحجز من جديد");
  });

  it("الملاحظة تُرسم عند القائمة لا في تذييل نموذج الحجز", () => {
    // `error` يُرسم أسفل الصفحة عند زر التأكيد؛ من ضغط «إلغاء» أعلاها لا يراه.
    const listSection = booking.match(/<FeedbackNote feedback=\{appointmentNotice\}[\s\S]{0,200}?upcoming\.length > 0/)?.[0];
    expect(listSection).toBeTruthy();
  });
});
