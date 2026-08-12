import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import {
  INDEXABLE_ROBOTS,
  PRIVATE_ROBOTS,
  SITE_LANGUAGE,
  SOCIAL_IMAGE,
  SITE_NAME,
  breadcrumbJsonLd,
  organizationJsonLd,
  publicPageMetadata,
  softwareApplicationJsonLd,
  webPageJsonLd,
  webSiteJsonLd,
} from "../lib/seo";
import { PRIVATE_ROUTE_PREFIXES, PUBLIC_ROUTES } from "../lib/seo-routes";
import { indexNowKeyLocation, submitToIndexNow } from "../lib/seo-indexnow";
import { siteUrl } from "../lib/site";

/**
 * ما يحرسه هذا الملف ليس «هل الـ SEO جيد» — بل التناقضات التي تُسقط صفحة من
 * الفهرس بصمت ولا يظهر أثرها إلا بعد أسابيع في Search Console.
 */
describe("خريطة الموقع وrobots", () => {
  const disallowedPrefixes = PRIVATE_ROUTE_PREFIXES;

  it("لا تُرشد خريطة الموقع إلى مسار محظور في robots", () => {
    for (const entry of sitemap()) {
      const path = new URL(entry.url).pathname;
      for (const prefix of disallowedPrefixes) {
        expect(path.startsWith(prefix), `${path} محظور بـ ${prefix} ومُدرج في الخريطة`).toBe(false);
      }
    }
  });

  it("تسمح قواعد robots صراحةً بكل مسار في الخريطة", () => {
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];
    const sitemapPaths = sitemap().map((entry) => new URL(entry.url).pathname);

    // قاعدة واحدة لا تكفي: زواحف تتجاهل `*` متى وجدت مجموعة باسمها.
    for (const group of groups) {
      const allow = [group.allow ?? []].flat();
      for (const path of sitemapPaths) {
        expect(allow, `${String(group.userAgent)} لا يسمح بـ ${path}`).toContain(path);
      }
    }
  });

  it("تحظر كل مسار خاص لدى كل زاحف معلن", () => {
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];

    for (const group of groups) {
      const disallow = [group.disallow ?? []].flat();
      // المسارات التي يحمل رابطها السرّ نفسه: فهرسة واحدة تكشف بيانات زبون.
      expect(disallow).toContain("/my/");
      expect(disallow).toContain("/receipt/");
      expect(disallow).toEqual([...disallowedPrefixes]);
    }
  });

  it("تبني الروابط من الأصل المُعلن لا من مضيف الطلب", () => {
    // الصفحة نفسها تُقدَّم من نطاقات المستأجرين الفرعية؛ رابط مبني على المضيف
    // كان سيُنتج خريطة موقع لكل مستأجر وتوزيع وزن النطاق على عشرات النسخ.
    for (const entry of sitemap()) expect(entry.url.startsWith(siteUrl)).toBe(true);
    expect(robots().sitemap).toBe(`${siteUrl}/sitemap.xml`);
  });

  it("تحمل كل صفحة في الخريطة تاريخ تعديل ثابتًا لا لحظة الطلب", () => {
    const first = sitemap();
    const second = sitemap();

    for (const [index, entry] of first.entries()) {
      expect(entry.lastModified).toBeInstanceOf(Date);
      // `lastmod` يتغيّر مع كل طلب يعني «كل صفحاتي تتغيّر كل ثانية»، فيتوقف
      // المحرك عن الوثوق بالحقل ويتجاهله في الصفحة التي عُدِّلت فعلًا.
      expect(String(entry.lastModified)).toBe(String(second[index].lastModified));
    }
  });
});

describe("قياس الصفحات العامة", () => {
  it("تُعرّف كل صفحة رابطها الأساسي بنفسها", () => {
    const meta = publicPageMetadata({ path: "/terms", title: "الشروط", description: "وصف" });

    expect(meta.alternates?.canonical).toBe("/terms");
    expect(meta.alternates?.languages?.[SITE_LANGUAGE]).toBe(`${siteUrl}/terms`);
    expect(meta.alternates?.languages?.["x-default"]).toBe(`${siteUrl}/terms`);
    expect(meta.openGraph?.url).toBe(`${siteUrl}/terms`);
    expect(meta.robots).toBe(INDEXABLE_ROBOTS);
  });

  it("تحمل كل صفحة عامة صورة بطاقة المشاركة صراحةً", () => {
    // Next **يستبدل** كائن `openGraph` عندما يُعيد تعريفه مقطع أعمق ولا يدمجه،
    // فصفحة تُعرّف بطاقتها تفقد الصورة الموروثة من `app/opengraph-image.tsx`
    // ويخرج رابطها في واتساب مستطيلًا فارغًا.
    const meta = publicPageMetadata({ path: "/privacy", title: "الخصوصية", description: "وصف" });

    expect(meta.openGraph?.images).toEqual([SOCIAL_IMAGE]);
    expect(meta.twitter?.images).toEqual([SOCIAL_IMAGE]);
    expect(SOCIAL_IMAGE.url.startsWith(siteUrl)).toBe(true);
  });

  it("لا يضع التخطيط الجذري رابطًا أساسيًا يرثه الجميع", () => {
    // `alternates` يُورَّث في Next: رابط واحد في الجذر يجعل كل صفحة تعلن أنها
    // نسخة من الرئيسية فتسقط جميعها من الفهرس.
    const rootLayout = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");
    expect(rootLayout).not.toMatch(/alternates\s*:/);
  });

  it("تحمل كل صفحة عامة مسارها في القياس والبيانات المنظّمة", () => {
    for (const route of PUBLIC_ROUTES) {
      if (route.path === "/" || route.path === "/signup") continue;
      const source = readFileSync(join(process.cwd(), "app", route.path.slice(1), "page.tsx"), "utf8");
      expect(source, `${route.path} بلا publicPageMetadata`).toContain(`path: "${route.path}"`);
      expect(source, `${route.path} بلا مسار في LegalPage`).toContain(`path="${route.path}"`);
    }
  });

  it("يوسم الخاصّ بـ noindex وnoarchive", () => {
    expect(PRIVATE_ROBOTS.index).toBe(false);
    expect(PRIVATE_ROBOTS.follow).toBe(false);
    expect(PRIVATE_ROBOTS.noarchive).toBe(true);
  });

  it("يُرفع سقف المقتطف وحجم الصورة للصفحات العامة", () => {
    // بدونهما تظهر النتيجة سطرًا بلا صورة بجوار منافس يعرض بطاقة كاملة.
    expect(INDEXABLE_ROBOTS.googleBot).toMatchObject({
      "max-image-preview": "large",
      "max-snippet": -1,
    });
  });
});

describe("البيانات المنظّمة", () => {
  const graph = [
    organizationJsonLd(),
    webSiteJsonLd(),
    webPageJsonLd({ path: "/", name: SITE_NAME, description: "وصف" }),
    softwareApplicationJsonLd({
      trialDays: 14,
      plans: [{ name: "الأساسية", priceMonthly: 99, priceYearly: 990, description: null }],
    }),
  ];

  it("لا تترك مرجع @id معلّقًا خارج الرسم", () => {
    // مرجع إلى عقدة غير موجودة يرفضه مدقّق النتائج الغنية ويُسقط الصفحة كلها
    // من الأهلية، لا العقدة المعطوبة وحدها.
    const ids = new Set(graph.map((node) => (node as { "@id": string })["@id"]));
    const references = [...JSON.stringify(graph).matchAll(/\{"@id":"([^"]+)"\}/g)].map((match) => match[1]);

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) expect(ids, `مرجع معلّق: ${reference}`).toContain(reference);
  });

  it("لا تربط الصفحة بمسار تنقّل لم تُصدره", () => {
    expect(webPageJsonLd({ path: "/", name: "أ", description: "ب" })).not.toHaveProperty("breadcrumb");
    expect(webPageJsonLd({ path: "/terms", name: "أ", description: "ب", hasBreadcrumb: true })).toHaveProperty(
      "breadcrumb",
    );
  });

  it("يبني مسار التنقّل بمواضع متسلسلة وروابط مطلقة", () => {
    const crumbs = breadcrumbJsonLd([
      { name: "الرئيسية", path: "/" },
      { name: "الشروط", path: "/terms" },
    ]);

    expect(crumbs.itemListElement.map((item) => item.position)).toEqual([1, 2]);
    expect(crumbs.itemListElement[1].item).toBe(`${siteUrl}/terms`);
  });

  it("تعلن الأسعار المنشورة فعلًا بعملتها", () => {
    const app = softwareApplicationJsonLd({
      trialDays: 14,
      plans: [{ name: "النمو", priceMonthly: 199, priceYearly: 1990, description: null }],
    });

    // سعر في البيانات المنظّمة يخالف الظاهر على الصفحة أكثر سبب لرفض النتائج
    // الغنية، لذلك تُبنى من نفس الباقات المعروضة.
    expect(app.offers.map((offer) => offer.price)).toEqual(["0", "199", "1990"]);
    for (const offer of app.offers) expect(offer.priceCurrency).toBe("SAR");
  });

  it("لا تدّعي تقييمًا أو مراجعات", () => {
    // تقييم ملفّق يُسقط النطاق من النتائج الغنية بعقوبة يدوية لا تُسترد بسهولة.
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("aggregateRating");
    expect(serialized).not.toContain("reviewCount");
  });
});

describe("IndexNow", () => {
  const proofValue = "fixture-value";

  it("ينشر الرمز على المضيف نفسه لإثبات الملكية", () => {
    expect(indexNowKeyLocation(proofValue)).toBe(`${siteUrl}/indexnow/${proofValue}.txt`);
  });

  it("يستبعد أي رابط خارج المضيف المُعلن", async () => {
    process.env.INDEXNOW_KEY = proofValue;
    let body: { host: string; urlList: string[]; keyLocation: string } | null = null;

    // المواصفة ترفض الدفعة كاملة إن حوت رابطًا من مضيف آخر، فالتصفية قبل
    // الإرسال تحمي بقية الروابط بدل خسارتها بخطأ 422 واحد.
    const result = await submitToIndexNow(
      [`${siteUrl}/`, "https://example.com/spam", `${siteUrl}/`],
      (async (_url: string, init: { body: string }) => {
        body = JSON.parse(init.body);
        return { status: 200, text: async () => "OK" };
      }) as unknown as typeof fetch,
    );

    expect(result.ok).toBe(true);
    expect(result.submitted).toEqual([`${siteUrl}/`]);
    expect(body!.urlList).toEqual([`${siteUrl}/`]);
    expect(body!.host).toBe(new URL(siteUrl).host);
    expect(body!.keyLocation).toBe(indexNowKeyLocation(proofValue));
  });

  it("يرفض العمل بلا رمز مضبوط", async () => {
    delete process.env.INDEXNOW_KEY;
    await expect(submitToIndexNow([`${siteUrl}/`])).rejects.toThrow(/INDEXNOW_KEY/);
  });
});
