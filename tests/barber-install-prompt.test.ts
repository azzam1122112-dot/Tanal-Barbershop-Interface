import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INSTALL_SNOOZE_KEY, INSTALL_SNOOZE_MS, isInstallSnoozed, nextInstallSnooze } from "../lib/pwa/install-snooze";

/**
 * دعوة تثبيت تطبيق الحلاق — عطلان صامتان لا يظهران في أي اختبار سلوكي.
 *
 * الأول: المتصفح يُطلق `beforeinstallprompt` **مرة واحدة أثناء تحميل الصفحة ولا
 * يعيده**، وكان المستمع الوحيد داخل `useEffect` — أي بعد ترطيب React. فيقع
 * الحدث في الفراغ ولا يرى الحلاق الدعوة أبدًا.
 *
 * الثاني: الإخفاء كان يُكتب `"1"` بلا زمن، فيُسكت الدعوة إلى الأبد.
 */
describe("barber install prompt", () => {
  it("captures beforeinstallprompt before React hydrates", () => {
    const layout = readFileSync(join(process.cwd(), "app", "barber", "layout.tsx"), "utf8");

    // سكربت مضمّن ينفَّذ أثناء تحليل HTML، يمنع النافذة التلقائية ويحتفظ بالحدث.
    expect(layout).toContain("beforeinstallprompt");
    expect(layout).toContain("preventDefault");
    expect(layout).toContain("__xInstallPrompt");
    expect(layout).toContain("dangerouslySetInnerHTML");
  });

  it("reads the stashed event instead of relying on its own listener alone", () => {
    for (const file of [
      join(process.cwd(), "components", "barber", "pwa.tsx"),
      join(process.cwd(), "components", "barber", "install-card.tsx"),
    ]) {
      expect(readFileSync(file, "utf8")).toContain("__xInstallPrompt");
    }
  });

  it("treats hiding as a snooze, and the legacy permanent value as expired", () => {
    const now = 1_700_000_000_000;

    // القيمة القديمة `"1"` كانت أبدية — تُقرأ الآن منتهية فتعود الدعوة بلا ترحيل.
    expect(isInstallSnoozed("1", now)).toBe(false);
    expect(isInstallSnoozed(null, now)).toBe(false);
    expect(isInstallSnoozed("", now)).toBe(false);
    expect(isInstallSnoozed("not-a-number", now)).toBe(false);

    const until = nextInstallSnooze(now);
    expect(isInstallSnoozed(until, now)).toBe(true);
    expect(isInstallSnoozed(until, now + INSTALL_SNOOZE_MS - 1)).toBe(true);
    // تنتهي المهلة فتعود الدعوة من نفسها.
    expect(isInstallSnoozed(until, now + INSTALL_SNOOZE_MS + 1)).toBe(false);
  });

  it("never re-arms the permanent key on install", () => {
    const pwa = readFileSync(join(process.cwd(), "components", "barber", "pwa.tsx"), "utf8");
    const onInstalled = pwa.match(/function onInstalled\(\)[\s\S]*?\n {4}\}/)?.[0] ?? "";

    // تسجيل إسكات هنا كان يمنع عودة الدعوة لمن أزال التطبيق ثم أراده مجددًا.
    expect(onInstalled).not.toContain("snooze");
    expect(onInstalled).not.toContain(INSTALL_SNOOZE_KEY);
  });
});
