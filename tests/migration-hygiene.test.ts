import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * نظافة تاريخ الهجرات.
 *
 * Prisma يرتّب الهجرات باسم المجلد كاملًا، فطابعان متطابقان يعملان اليوم لكنهما
 * يفقدان معنى الترتيب الزمني: من يقرأ التاريخ لا يعرف أيّهما سبق، ومن يكتب هجرة
 * تعتمد على أخرى بنفس الطابع يقامر على ترتيب أبجدي غير مقصود.
 *
 * **التصادم القائم مستثنى صراحةً ولا يُعاد تسميته:** الهجرتان مطبَّقتان بالفعل،
 * وإعادة تسمية هجرة مطبَّقة على بيئة مشتركة تجعل Prisma يراها هجرة جديدة فيعيد
 * تطبيقها. الحارس يمنع **تصادمًا جديدًا** لا يصحّح ماضيًا.
 */

/** تصادم معروف وموثَّق: عملان متوازيان أنتجا الطابع نفسه، وكلاهما مطبَّق. */
const KNOWN_COLLISIONS = new Set(["20260812120000"]);

describe("migration history hygiene", () => {
  it("has no new timestamp collisions", () => {
    const directory = join(process.cwd(), "prisma/migrations");
    const timestamps = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.split("_", 1)[0]);

    const seen = new Set<string>();
    const collisions = new Set<string>();
    for (const timestamp of timestamps) {
      if (seen.has(timestamp)) collisions.add(timestamp);
      seen.add(timestamp);
    }

    expect([...collisions].filter((timestamp) => !KNOWN_COLLISIONS.has(timestamp))).toEqual([]);
  });

  it("keeps every migration name sortable and dated", () => {
    const directory = join(process.cwd(), "prisma/migrations");
    const names = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // اسم بلا طابع من 14 رقمًا يكسر الترتيب على قاعدة جديدة.
    expect(names.filter((name) => !/^\d{14}_[a-z0-9_]+$/.test(name))).toEqual([]);
  });
});
