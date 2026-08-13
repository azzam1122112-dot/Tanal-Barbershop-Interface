import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ملصق الانضمام لبرنامج الولاء — ورقة تُعلَّق أمام الزبون، وأعطالها كلها صامتة:
 * لا اختبار سلوكي يكشف ورقة خرجت بيضاء من الطابعة أو رمزًا لا يُمسح.
 */
const poster = readFileSync(join(process.cwd(), "components", "dashboard", "loyalty-join-poster.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const customersPage = readFileSync(join(process.cwd(), "app", "dashboard", "(shell)", "customers", "page.tsx"), "utf8");

/** قسم الملصق في `globals.css` وحده — حتى لا تُقرأ قواعد التقارير مكانه. */
const posterCss = css.slice(css.indexOf("/* ===== ملصق التسجيل في برنامج الولاء"), css.indexOf("/* ===== طباعة تقارير اللوحة"));

const PX_PER_MM = 96 / 25.4;
/** منطقة الطباعة داخل A4 عمودي بهوامش 12 مم (القاعدة العامة في قسم التقارير). */
const PRINTABLE_MM = { width: 210 - 24, height: 297 - 24 };

function constantOf(name: string) {
  const value = poster.match(new RegExp(`const ${name} = (\\d+)`))?.[1];
  return Number(value);
}

describe("loyalty join poster", () => {
  it("keeps the sheet inside the A4 printable area", () => {
    // الورقة مقاسها بالبكسل والطباعة بالملّيمتر: مقاسٌ أكبر من منطقة الطباعة
    // يقذف شريطًا من الملصق إلى صفحة ثانية فارغة عمليًا.
    expect(constantOf("SHEET_WIDTH") / PX_PER_MM).toBeLessThanOrEqual(PRINTABLE_MM.width);
    expect(constantOf("SHEET_HEIGHT") / PX_PER_MM).toBeLessThanOrEqual(PRINTABLE_MM.height);
  });

  it("prints the same sheet it previews — no second copy", () => {
    // نسخة للشاشة وأخرى للطباعة تعني ملصقين يتخلّف أحدهما عن الآخر.
    expect(poster.match(/join-poster-sheet/g)).toHaveLength(1);
    expect(posterCss).toContain("transform: none !important");
  });

  it("forces dark surfaces to print", () => {
    // بدون هذا يُسقط Chrome خلفية الترويسة الداكنة ويُبقي نصها الأبيض:
    // ورقة بيضاء يظن المدير أن الحبر نفد وهو لم ينفد.
    expect(posterCss).toContain("print-color-adjust: exact");
    expect(posterCss).toContain("-webkit-print-color-adjust: exact");
  });

  it("hides everything that is not the poster, without enumerating panels", () => {
    // التعداد اليدوي كان يتخلّف عن الشاشة فيُطبع مع الملصق شرحٌ مكتوب للمدير.
    expect(posterCss).toContain("body:has(.join-poster-sheet) *:not(:has(.join-poster-sheet))");
    expect(posterCss).not.toContain(".dashboard-panel");
    // وأجداد الملصق تتخلّى عن قصّها وارتفاع المعاينة وإلا طُبع الملصق مقصوصًا.
    expect(posterCss).toContain("overflow: visible !important");
    expect(posterCss).toContain("height: auto !important");
  });

  it("does not redefine @page — that rule is shared with receipts and reports", () => {
    // القاعدة لا التعليق: القسم يشرح لماذا لا `@page` هنا، والممنوع هو الكتلة.
    expect(posterCss).not.toMatch(/@page\s*\{/);
  });

  it("keeps the QR on a plain white card", () => {
    // منطقة الهدوء وسطحٌ أبيض شرطُ قراءة الرمز بالكاميرا في إضاءة الصالون.
    expect(posterCss).toMatch(/\.join-poster-qr-card \{[^}]*background: #ffffff/);
  });

  it("carries both identities: the platform and this salon", () => {
    expect(poster).toContain("إكس مانس إكس XMANSX");
    expect(poster).toContain("{salonName}");
  });

  it("encodes an absolute join link in the QR", () => {
    // ملصق يُطبع مرة ويبقى معلّقًا: رابط نسبي أو مبني على مضيف الطلب يخرج
    // مطبوعًا على نطاق مستأجر فرعي أو مكسورًا تمامًا.
    expect(customersPage).toContain("const joinUrl = absoluteUrl(joinPath)");
    expect(customersPage).toContain("buildQrSvg(joinUrl");
  });

  it("shows this salon's own offer, not a generic promise", () => {
    expect(customersPage).toContain("rewardRule.findMany");
    expect(poster).toContain("pointsPerRiyal");
    expect(poster).toContain("lowestRewardPoints");
  });
});
