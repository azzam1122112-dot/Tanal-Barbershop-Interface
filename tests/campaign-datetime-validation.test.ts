import { describe, expect, it } from "vitest";
import { campaignCreateSchema, managerRewardCreateSchema } from "../lib/auth/validation";

describe("campaign and reward Riyadh date times", () => {
  it("stores datetime-local campaign boundaries as Riyadh instants", () => {
    const result = campaignCreateSchema.parse({
      name: "عرض نهاية الأسبوع",
      discountType: "FIXED_AMOUNT",
      discountValue: 25,
      targetType: "ALL_CUSTOMERS",
      startAt: "2026-08-15T04:00",
      endAt: "2026-08-29T23:00",
      maxUsesPerCustomer: 2,
    });

    expect(result.startAt.toISOString()).toBe("2026-08-15T01:00:00.000Z");
    expect(result.endAt.toISOString()).toBe("2026-08-29T20:00:00.000Z");
  });

  it("keeps explicit ISO instants unchanged", () => {
    const result = campaignCreateSchema.parse({
      name: "عرض صريح",
      discountType: "PERCENTAGE",
      discountValue: 10,
      targetType: "ALL_CUSTOMERS",
      startAt: "2026-08-15T01:00:00.000Z",
      endAt: "2026-08-29T20:00:00.000Z",
      maxUsesPerCustomer: 1,
    });

    expect(result.startAt.toISOString()).toBe("2026-08-15T01:00:00.000Z");
    expect(result.endAt.toISOString()).toBe("2026-08-29T20:00:00.000Z");
  });

  it("applies the same Riyadh rule to manager reward expiry", () => {
    const result = managerRewardCreateSchema.parse({
      title: "هدية ترحيبية",
      discountAmount: 35,
      expiresAt: "2096-08-29T23:00",
    });

    expect(result.expiresAt?.toISOString()).toBe("2096-08-29T20:00:00.000Z");
  });
});
