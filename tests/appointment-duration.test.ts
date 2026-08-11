import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  MAX_APPOINTMENT_SERVICES,
  resolveAppointmentServices,
  roundUpToSlot,
} from "../lib/appointments/appointment-duration";

/** كتالوج الفرع في الاختبار — المدد هي ما يجب أن يُقرأ، لا ما يُرسله العميل. */
const catalog = [
  { id: "cut", name: "قص", durationMinutes: 30, defaultPrice: 40 },
  { id: "beard", name: "لحية", durationMinutes: 20, defaultPrice: 25 },
  { id: "color", name: "صبغة", durationMinutes: 45, defaultPrice: 120 },
  { id: "marathon", name: "خدمة طويلة", durationMinutes: 470, defaultPrice: 900 },
];

const scope = { organizationId: "org", salonId: "salon" };

describe("roundUpToSlot", () => {
  it("يقرّب لأعلى لمضاعف الفترة", () => {
    expect(roundUpToSlot(45, 30)).toBe(60);
    expect(roundUpToSlot(90, 30)).toBe(90);
    expect(roundUpToSlot(95, 30)).toBe(120);
  });

  it("لا ينزل تحت فترة واحدة", () => {
    expect(roundUpToSlot(5, 30)).toBe(30);
    expect(roundUpToSlot(0, 30)).toBe(30);
  });
});

describe("resolveAppointmentServices", () => {
  it("يجمع مدد الخدمات ويقرّبها لشبكة العميل", async () => {
    const resolved = await resolveAppointmentServices(prismaWith(catalog), {
      ...scope,
      serviceIds: ["cut", "beard", "color"],
      slotMinutes: 30,
    });

    expect(resolved?.serviceMinutes).toBe(95);
    // 95 دقيقة على شبكة نصف الساعة تحجز ساعتين — لا فتات عالق بين موعدين.
    expect(resolved?.bookedMinutes).toBe(120);
    expect(resolved?.estimatedTotal).toBe(185);
  });

  it("لا يقرّب حين لا تُمرَّر شبكة — حجز الموظف حرّ بالتصميم", async () => {
    const resolved = await resolveAppointmentServices(prismaWith(catalog), {
      ...scope,
      serviceIds: ["cut", "beard"],
    });

    expect(resolved?.serviceMinutes).toBe(50);
    expect(resolved?.bookedMinutes).toBe(50);
  });

  it("يحفظ ترتيب الاختيار ويزيل المكرّر", async () => {
    const resolved = await resolveAppointmentServices(prismaWith(catalog), {
      ...scope,
      serviceIds: ["beard", "cut", "beard"],
      slotMinutes: 30,
    });

    expect(resolved?.lines.map((line) => line.serviceId)).toEqual(["beard", "cut"]);
    // المكرَّر لا يُضاعف المدة: 50 لا 70.
    expect(resolved?.serviceMinutes).toBe(50);
  });

  it("يعيد null بلا خدمات — الحجز بلا تفصيل يبقى مقبولًا", async () => {
    expect(
      await resolveAppointmentServices(prismaWith(catalog), { ...scope, serviceIds: [], slotMinutes: 30 }),
    ).toBeNull();
  });

  it("يرفض خدمة ليست في هذا الفرع", async () => {
    await expect(
      resolveAppointmentServices(prismaWith(catalog), {
        ...scope,
        serviceIds: ["cut", "ghost"],
        slotMinutes: 30,
      }),
    ).rejects.toThrow("غير متاحة في هذا الفرع");
  });

  it("يرفض عددًا من الخدمات يتجاوز الحد", async () => {
    await expect(
      resolveAppointmentServices(prismaWith(catalog), {
        ...scope,
        serviceIds: Array.from({ length: MAX_APPOINTMENT_SERVICES + 1 }, (_, index) => `service-${index}`),
        slotMinutes: 30,
      }),
    ).rejects.toThrow("أكثر من");
  });

  it("يرفض مجموع مدد يتجاوز سقف الموعد الواحد", async () => {
    await expect(
      resolveAppointmentServices(prismaWith(catalog), {
        ...scope,
        serviceIds: ["marathon", "cut"],
        slotMinutes: 30,
      }),
    ).rejects.toThrow("تتجاوز");
  });

  it("يرفض تقريبًا يتجاوز السقف ولو كان المجموع تحته", async () => {
    // 470 دقيقة تحت السقف (480)، لكن التقريب لشبكة الساعة يرفعها إلى 480…
    // ومع شبكة 45 يصبح التقريب 495 — فوق السقف.
    await expect(
      resolveAppointmentServices(prismaWith(catalog), {
        ...scope,
        serviceIds: ["marathon"],
        slotMinutes: 45,
      }),
    ).rejects.toThrow("أطول من أن تُحجز");
  });

  it("يقرأ المدة من الكتالوج لا من الطلب", async () => {
    // كتالوج عُدّلت فيه مدة القص إلى 60: اللقطة تتبع القاعدة لا أي رقم مُرسَل.
    const resolved = await resolveAppointmentServices(
      prismaWith([{ ...catalog[0], durationMinutes: 60 }]),
      { ...scope, serviceIds: ["cut"], slotMinutes: 30 },
    );
    expect(resolved?.lines[0]?.durationMinutes).toBe(60);
  });
});

/** محاكاة تحترم فلتر `id.in` كما تفعل القاعدة، فتُكشف الخدمة الغريبة. */
function prismaWith(services: typeof catalog) {
  return {
    service: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        services.filter((service) => where.id.in.includes(service.id)),
    },
  } as unknown as PrismaClient;
}
