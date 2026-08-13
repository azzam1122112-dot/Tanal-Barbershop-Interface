import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEVICE_OFFLINE_MESSAGE,
  OFFLINE_MESSAGE,
  isOfflineResponse,
  safeFetch,
} from "../lib/http/safe-fetch";
import { HANDOFF_NOTICE_KEY, readHandoffNotice, serializeHandoffNotice } from "../lib/ui/handoff-notice";

/**
 * «لا يتم أي شيء بشكل صامت» — أعطال لا يكشفها أي اختبار سلوكي لأن الشيفرة
 * تعمل كما كُتبت، والخلل في أن نتيجتها لا تصل إلى عين المستخدم.
 *
 * ثلاثة أنواع كانت قائمة:
 *   1. **فشلٌ بلا أثر:** الرسالة تُكتب خلف طبقة نافذة `z-[100]`، أو لا تُكتب أصلًا.
 *   2. **فشلٌ بلون نجاح:** نصٌّ واحد في `message` يُرسم بصنف ثابت أخضر.
 *   3. **نجاحٌ يُمحى:** تأكيدٌ يُكتب ثم يُعاد تحميل الصفحة في السطر التالي.
 */

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const relative = `${dir}/${entry}`;
    return statSync(join(root, relative)).isDirectory() ? walk(relative) : [relative];
  });
}

const clientComponents = [...walk("components"), ...walk("app")].filter(
  (file) => (file.endsWith(".tsx") || file.endsWith(".ts")) && read(file).includes('"use client"'),
);

describe("انقطاع الشبكة يُعلن ولا يُجمّد الزر", () => {
  it("كل نداء شبكة في مكوّنات العميل يمر عبر safeFetch", () => {
    // `fetch` الخام يرفض الوعد عند الانقطاع، فيُتخطّى `setLoading(false)` وكل
    // رسالة تحته: الزر يبقى «جاري الحفظ...» بلا سبب ظاهر.
    const offenders = clientComponents.filter((file) => /(?<![\w.])fetch\(/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("كل ملف يستدعي safeFetch يستورده فعلًا", () => {
    const missing = clientComponents.filter(
      (file) => read(file).includes("safeFetch(") && !read(file).includes('from "@/lib/http/safe-fetch"'),
    );
    expect(missing).toEqual([]);
  });

  it("safeFetch يعيد ردًّا فاشلًا مقروءًا بدل أن يرمي", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    try {
      const response = await safeFetch("/api/anything", { method: "POST" });

      // الفرع `else` الموجود أصلًا في كل معالج هو ما سيعرض الرسالة.
      expect(response.ok).toBe(false);
      expect(isOfflineResponse(response)).toBe(true);

      const body = (await response.json()) as { message?: string };
      expect([OFFLINE_MESSAGE, DEVICE_OFFLINE_MESSAGE]).toContain(body.message);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("الإلغاء يُعاد رميه فلا يُقرأ انقطاعًا", async () => {
    const original = globalThis.fetch;
    const abort = new DOMException("aborted", "AbortError");
    globalThis.fetch = (() => Promise.reject(abort)) as typeof fetch;
    try {
      // مكوّنات تلغي طلبها عند التفكيك وتفحص `AbortError` لتصمت. ابتلاعه يعني
      // رسالة «انقطع الاتصال» على شاشة تُغادر.
      await expect(safeFetch("/api/anything")).rejects.toBe(abort);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("النتيجة تُعرض بنبرتها لا بلون واحد", () => {
  const toned = [
    "components/barber/cash-session-panel.tsx",
    "components/barber/attendance-panel.tsx",
    "components/barber/customer-search.tsx",
    "components/barber/notification-center.tsx",
    "components/barber/visit-form.tsx",
    "components/dashboard/manager-reward-button.tsx",
    "components/dashboard/privacy-requests-manager.tsx",
    "components/dashboard/subscription-invoice-email-button.tsx",
    "components/public/customer-privacy-request.tsx",
  ];

  it.each(toned)("%s يعرض النتيجة عبر FeedbackNote", (file) => {
    expect(read(file)).toContain("FeedbackNote");
  });

  it("لا صندوق نجاح ثابت يعرض متغيّر رسالة غير مقيَّد بنبرة", () => {
    // النمط المحذوف: `{message ? <p className="...bg-emerald-50...">{message}</p> : null}`
    // فيقع «تعذر فتح جلسة الصندوق» في صندوق أخضر.
    const offenders = toned.filter((file) => {
      const source = read(file);
      return /\{message \?[\s\S]{0,220}?(bg-emerald-50|text-salon-forest|bg-salon-mist)/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("FeedbackNote يفرض النبرة في نوعه ويرافق اللون بأيقونة", () => {
    const source = read("components/ui/toast.tsx");

    // النبرة جزء من النوع فلا يمكن نسيانها — لا `tone?:`.
    expect(source).toContain("export type FeedbackState = { message: string; tone: FeedbackTone } | null;");
    // القاعدة نفسها المطبَّقة على `Badge`: من لا يميّز الأحمر من الأخضر يحتاج شكلًا.
    expect(source).toMatch(/NOTE_APPEARANCE[\s\S]*?glyph:/);
    expect(source).toContain('role={feedback.tone === "error" ? "alert" : "status"}');
  });
});

describe("الإشعار يظهر فوق النافذة التي أطلقته", () => {
  const toastSource = read("components/ui/toast.tsx");
  const css = read("app/globals.css");

  it("يُبَوَّب إلى body لا يُرسم داخل شجرة مُطلِقه", () => {
    // البطاقة كانت `z-50` داخل شجرة المكوّن، والنوافذ `z-[100]` فوقها: كل إشعار
    // يُطلق ونافذةٌ مفتوحة كان يُرسم خلفها.
    expect(toastSource).toContain("createPortal");
    expect(toastSource).toContain("x-toast-root");
  });

  it("جذر الإشعارات فوق طبقة النوافذ", () => {
    const rootRule = css.match(/\.x-toast-root \{[\s\S]*?\}/)?.[0] ?? "";
    const zIndex = Number(rootRule.match(/z-index:\s*(\d+)/)?.[1]);

    const overlayLayers = [...css.matchAll(/z-\[(\d+)\]/g)].map((match) => Number(match[1]));
    const maxOverlay = Math.max(100, ...overlayLayers);

    expect(zIndex).toBeGreaterThan(maxOverlay);
  });

  it("الجذر لا يبتلع النقرات والبطاقة وحدها تستقبلها", () => {
    expect(css).toMatch(/\.x-toast-root \{[\s\S]*?pointer-events: none;[\s\S]*?\}/);
    expect(toastSource).toContain("pointer-events-auto");
  });

  it("الخطأ يبقى أطول من التأكيد ويتوقف عدّه عند القراءة", () => {
    const durations = read("components/ui/toast.tsx");
    const dismiss = durations.match(/DISMISS_MS[\s\S]*?\};/)?.[0] ?? "";
    const success = Number(dismiss.match(/success:\s*(\d+)/)?.[1]);
    const error = Number(dismiss.match(/error:\s*(\d+)/)?.[1]);

    expect(error).toBeGreaterThan(success);
    expect(durations).toContain("setPaused(true)");
  });
});

describe("تأكيد التأكيد لا يُمحى بإعادة التحميل", () => {
  it("كل مكوّن يعيد التحميل بعد نجاح يودع تأكيده أولًا", () => {
    const reloaders = clientComponents.filter((file) => read(file).includes("window.location.reload()"));

    // `pwa.tsx` يعيد التحميل لتفعيل عامل خدمة جديد لا بعد طفرة — لا تأكيد له.
    const needsNotice = reloaders.filter((file) => !file.endsWith("barber/pwa.tsx"));
    const silent = needsNotice.filter((file) => !read(file).includes("handOffNotice"));

    expect(silent).toEqual([]);
    expect(needsNotice.length).toBeGreaterThan(0);
  });

  it("الترحيل مركَّب في تخطيط الحلاق واللوحة لا في الصفحات", () => {
    expect(read("app/barber/layout.tsx")).toContain("<NoticeRelay />");
    expect(read("app/dashboard/(shell)/layout.tsx")).toContain("<NoticeRelay />");
  });

  it("التأكيد يُقرأ مرة ثم يُمحى", () => {
    const relay = read("components/ui/notice-relay.tsx");
    expect(relay).toContain("takeHandoffNotice");
    // `take` لا `read`: إشعارٌ يعود مع كل تحديث للصفحة يصير ضجيجًا يُتجاهَل.
    expect(read("lib/ui/handoff-notice.ts")).toMatch(/takeHandoffNotice[\s\S]*?removeItem/);
  });

  it("يقرأ المودَع الصحيح ويرفض التالف", () => {
    expect(readHandoffNotice(serializeHandoffNotice("تم فتح جلسة الصندوق"))).toEqual({
      message: "تم فتح جلسة الصندوق",
      tone: "success",
    });
    expect(readHandoffNotice(serializeHandoffNotice("تعذر", "error"))).toEqual({ message: "تعذر", tone: "error" });

    // قيمة تالفة أو فارغة لا تُنتج إشعارًا فارغًا على الشاشة.
    expect(readHandoffNotice(null)).toBeNull();
    expect(readHandoffNotice("{")).toBeNull();
    expect(readHandoffNotice(JSON.stringify({ message: "   " }))).toBeNull();
    expect(readHandoffNotice(JSON.stringify({ message: "x", tone: "bogus" }))).toEqual({ message: "x", tone: "success" });
    expect(HANDOFF_NOTICE_KEY).toBe("x-handoff-notice");
  });
});

describe("تأكيد الزيارة يُعلن نتيجته داخل النافذة", () => {
  const source = read("components/barber/visit-form.tsx");

  it("رسالة الفشل تُرسم في تذييل نافذة المعاينة لا خلفها", () => {
    // أخطر ما كان: يضغط الحلاق «إتمام العملية»، تُرفض الزيارة، ولا يظهر شيء
    // لأن الفقرة في جسم النموذج تحت طبقة `z-[100]`. يسلّم الباقي ويمضي.
    const footer = source.match(/<div className="shrink-0 border-t border-salon-line bg-white p-4">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(footer).toContain("<FeedbackNote feedback={feedback}");
  });

  it("انقطاع الشبكة عند التأكيد يطمئن إلى عدم التكرار", () => {
    // المفتاح `idempotencyKey` باقٍ، فإعادة المحاولة لا تُنشئ زيارة ثانية.
    expect(source).toContain("idempotencyKey");
    expect(source).toMatch(/catch \{[\s\S]*?لن تتكرر الزيارة/);
  });

  it("لا يبقى زر تأكيد بلا إطفاء عند الفشل", () => {
    expect(source).toMatch(/finally \{\s*setLoadingConfirm\(false\);/);
    expect(source).toMatch(/finally \{\s*setLoadingPreview\(false\);/);
  });
});

describe("نوافذ التأكيد داخل التطبيق لا نوافذ المتصفح", () => {
  it("لا window.confirm ولا alert في أي شاشة", () => {
    const offenders = clientComponents.filter((file) => /window\.(confirm|alert)\(/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
