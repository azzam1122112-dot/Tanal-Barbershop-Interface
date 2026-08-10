import { describe, expect, it } from "vitest";
import { buildBarberLoginMessage, toWhatsAppPhone } from "../lib/barbers/login-share";

describe("barber login sharing", () => {
  it("builds complete credentials when a new pin is available", () => {
    const message = buildBarberLoginMessage({
      name: "أحمد",
      phone: "0501234567",
      loginUrl: "https://example.com/barber/login",
      pin: "NewPass#123",
    });

    expect(message).toContain("مرحبًا أحمد");
    expect(message).toContain("https://example.com/barber/login");
    expect(message).toContain("0501234567");
    expect(message).toContain("رمز الدخول: NewPass#123");
  });

  it("does not invent an unavailable pin and normalizes Saudi WhatsApp numbers", () => {
    const message = buildBarberLoginMessage({
      name: "محمد",
      phone: "0551234567",
      loginUrl: "https://example.com/barber/login",
    });

    expect(message).toContain("استخدم الرمز الذي سلّمك مدير الصالون");
    expect(toWhatsAppPhone("0551234567")).toBe("966551234567");
    expect(toWhatsAppPhone("966551234567")).toBe("966551234567");
  });
});
