import { describe, expect, it, vi } from "vitest";
import { resolveLoginIdentity } from "../lib/auth/login-resolver";

type Identity = { id: string; secret: string; org: { id: string; name: string } | null };

const orgA = { id: "org-a", name: "صالون العليا" };
const orgB = { id: "org-b", name: "صالون النخيل" };

const verifySecret = (expected: string) => async (identity: Identity) => identity.secret === expected;
const orgOf = (identity: Identity) => identity.org;

describe("حلّ المؤسسة عند الدخول بلا معرّف مؤسسة", () => {
  it("يدخل مباشرة عند وجود هوية واحدة مطابقة", async () => {
    const result = await resolveLoginIdentity(
      [{ id: "u1", secret: "correct", org: orgA }],
      verifySecret("correct"),
      orgOf,
    );
    expect(result.outcome).toBe("SINGLE");
    if (result.outcome === "SINGLE") expect(result.identity.id).toBe("u1");
  });

  it("يرفض عند عدم تطابق بيانات الاعتماد", async () => {
    const result = await resolveLoginIdentity(
      [{ id: "u1", secret: "correct", org: orgA }],
      verifySecret("wrong"),
      orgOf,
    );
    expect(result.outcome).toBe("NO_MATCH");
  });

  it("يرفض عند غياب أي مرشّح دون استدعاء التحقق", async () => {
    const verify = vi.fn();
    const result = await resolveLoginIdentity([], verify, orgOf);
    expect(result.outcome).toBe("NO_MATCH");
    expect(verify).not.toHaveBeenCalled();
  });

  it("يدخل مباشرة إذا طابق مرشّح واحد فقط من عدة مؤسسات", async () => {
    // نفس البريد في صالونين لكن بكلمة مرور مختلفة: لا حاجة لسؤال المستخدم.
    const result = await resolveLoginIdentity(
      [
        { id: "u1", secret: "correct", org: orgA },
        { id: "u2", secret: "other", org: orgB },
      ],
      verifySecret("correct"),
      orgOf,
    );
    expect(result.outcome).toBe("SINGLE");
    if (result.outcome === "SINGLE") expect(result.identity.id).toBe("u1");
  });

  it("يعرض أسماء الصالونات للاختيار عند تطابق أكثر من واحد", async () => {
    const result = await resolveLoginIdentity(
      [
        { id: "u1", secret: "same", org: orgA },
        { id: "u2", secret: "same", org: orgB },
      ],
      verifySecret("same"),
      orgOf,
    );
    expect(result.outcome).toBe("NEEDS_CHOICE");
    if (result.outcome === "NEEDS_CHOICE") {
      expect(result.organizations).toEqual([orgA, orgB]);
      // أسماء لا معرّفات يكتبها المستخدم.
      expect(result.organizations.every((org) => org.name.length > 0)).toBe(true);
    }
  });

  it("لا يكشف المؤسسات إلا بعد نجاح التحقق", async () => {
    // كلمة مرور خاطئة مع وجود البريد في صالونين: لا تُذكر أي مؤسسة إطلاقًا.
    const result = await resolveLoginIdentity(
      [
        { id: "u1", secret: "a", org: orgA },
        { id: "u2", secret: "b", org: orgB },
      ],
      verifySecret("wrong"),
      orgOf,
    );
    expect(result.outcome).toBe("NO_MATCH");
    expect(result).not.toHaveProperty("organizations");
  });

  it("يحدّ عدد عمليات التحقق المكلفة بخمسة مرشّحين", async () => {
    const verify = vi.fn(async () => false);
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `u${index}`,
      secret: "x",
      org: { id: `org-${index}`, name: `صالون ${index}` },
    }));

    await resolveLoginIdentity(many, verify, orgOf);
    expect(verify).toHaveBeenCalledTimes(5);
  });

  it("يعامل تطابقًا متعددًا بمؤسسات مجهولة كعدم تطابق بدل دخول عشوائي", async () => {
    const result = await resolveLoginIdentity(
      [
        { id: "u1", secret: "same", org: null },
        { id: "u2", secret: "same", org: null },
      ],
      verifySecret("same"),
      orgOf,
    );
    expect(result.outcome).toBe("NO_MATCH");
  });
});
