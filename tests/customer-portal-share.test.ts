import { describe, expect, it } from "vitest";
import { buildCustomerPortalShareMessage } from "../lib/customers/portal-share";
import { toSaudiWhatsAppPhone } from "../lib/phone/saudi-phone";

describe("customer portal link sharing", () => {
  it("builds a personal message with the exact private portal link", () => {
    const message = buildCustomerPortalShareMessage({
      customerName: "خالد",
      portalUrl: "https://example.com/my/private-token",
    });

    expect(message).toContain("مرحبًا خالد");
    expect(message).toContain("https://example.com/my/private-token");
    expect(message).toContain("احتفظ بهذا الرابط");
    expect(message).toContain("لا تشاركه مع أي شخص");
  });

  it("turns the verified local number into a WhatsApp destination", () => {
    expect(toSaudiWhatsAppPhone("0501234567")).toBe("966501234567");
  });
});
