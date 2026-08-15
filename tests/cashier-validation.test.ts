import { describe, expect, it } from "vitest";
import { visitConfirmRequestSchema, visitRequestSchema } from "../lib/auth/validation";

const guestSale = {
  customerId: null,
  serviceIds: ["service-1"],
  grossAmount: 70,
  paymentMethod: "CASH" as const,
};

describe("cashier request validation", () => {
  it("allows previewing a guest sale without customer data", () => {
    expect(visitRequestSchema.safeParse(guestSale).success).toBe(true);
  });

  it("accepts a bounded final invoice total for cash and network checkout", () => {
    expect(visitRequestSchema.safeParse({ ...guestSale, invoiceTotal: 85.5 }).success).toBe(true);
    expect(visitRequestSchema.safeParse({ ...guestSale, paymentMethod: "NETWORK", invoiceTotal: 1_000_000 }).success).toBe(true);
    expect(visitRequestSchema.safeParse({ ...guestSale, invoiceTotal: 0 }).success).toBe(false);
    expect(visitRequestSchema.safeParse({ ...guestSale, invoiceTotal: 1_000_000.01 }).success).toBe(false);
  });

  it("does not finalize a sale until payment is explicitly confirmed", () => {
    expect(visitConfirmRequestSchema.safeParse({ ...guestSale, idempotencyKey: "checkout-123" }).success).toBe(false);
    expect(visitConfirmRequestSchema.safeParse({
      ...guestSale,
      idempotencyKey: "checkout-123",
      paymentConfirmed: true,
      cashTenderedAmount: 100,
    }).success).toBe(true);
  });
});
