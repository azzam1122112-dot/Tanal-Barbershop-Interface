import { describe, expect, it } from "vitest";
import { buildAppointmentWhatsAppMessage } from "../lib/appointments/barber-contact";
import { toSaudiWhatsAppPhone } from "../lib/phone/saudi-phone";

describe("barber appointment contact", () => {
  it("includes the customer, barber, salon, and appointment time", () => {
    const message = buildAppointmentWhatsAppMessage({
      customerName: "خالد",
      barberName: "أحمد",
      salonName: "صالون الأناقة",
      appointmentDateTime: "الثلاثاء 11 أغسطس، 06:30 م",
    });

    expect(message).toContain("مرحبًا خالد");
    expect(message).toContain("الحلاق أحمد");
    expect(message).toContain("صالون الأناقة");
    expect(message).toContain("06:30 م");
  });

  it("builds a Saudi WhatsApp destination from the booking phone", () => {
    expect(toSaudiWhatsAppPhone("0551234567")).toBe("966551234567");
  });
});
