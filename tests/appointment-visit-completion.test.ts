import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { openCashSession } from "../lib/cash-sessions/cash-session-service";
import { confirmVisit } from "../lib/visits/visit-service";
import { findCloseableAppointment, updateAppointmentStatus } from "../lib/appointments/appointment-service";

/**
 * إقفال الموعد بالزيارة.
 *
 * كانت `completeAppointmentWithVisit` بلا مستدعٍ واحد في المشروع كله، وهي
 * الموضع الوحيد الذي يضبط `Appointment.visitId`. وفي المقابل يرفض
 * `updateAppointmentStatus` ضبط `COMPLETED` ما لم يكن `visitId` موجودًا. فكانت
 * النتيجة أن **لا موعد يبلغ `COMPLETED` أبدًا** رغم أن الرسالة تَعِد المدير
 * بإقفال تلقائي عند تسجيل الزيارة. هذا الملف يحرس الوعد نفسه.
 */

const prisma = new PrismaClient();
const ORG = "org_default";
const SALON = "salon_default";

const createdVisitIds: string[] = [];
const createdAppointmentIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdBarberIds: string[] = [];
const createdServiceIds: string[] = [];
const createdCashSessionIds: string[] = [];

let barberId = "";
let otherBarberId = "";
let customerId = "";
let otherCustomerId = "";
let serviceId = "";

let idempotencyCounter = 0;
function nextKey(label: string) {
  idempotencyCounter += 1;
  return `apt-visit-${label}-${Date.now()}-${idempotencyCounter}`;
}

async function makeBarber(label: string) {
  const barber = await prisma.barber.create({
    data: {
      organizationId: ORG,
      salonId: SALON,
      name: `apt-visit-${label}-${Date.now()}`,
      phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
      accessPinHash: await hashBarberPin("Tanal@123"),
      isActive: true,
    },
  });
  createdBarberIds.push(barber.id);
  return barber.id;
}

async function makeCustomer(label: string, offset: number) {
  const result = await createCustomerWithLoyalty({
    enrollInLoyalty: true,
    prisma,
    organizationId: ORG,
    name: `عميل ${label}`,
    phone: `9665${(Date.now() + offset).toString().slice(-8)}`,
    createdByBarberId: barberId,
  });
  createdCustomerIds.push(result.customer.id);
  return result.customer.id;
}

async function makeAppointment(input: {
  barberId?: string | null;
  customerId?: string | null;
  status?: "BOOKED" | "ARRIVED";
}) {
  const appointment = await prisma.appointment.create({
    data: {
      organizationId: ORG,
      salonId: SALON,
      barberId: input.barberId === undefined ? barberId : input.barberId,
      customerId: input.customerId === undefined ? customerId : input.customerId,
      customerName: "عميل الموعد",
      customerPhone: "966500000000",
      startAt: new Date(),
      durationMinutes: 30,
      status: input.status ?? "ARRIVED",
    },
  });
  createdAppointmentIds.push(appointment.id);
  return appointment.id;
}

async function confirm(input: { appointmentId?: string | null; customerId?: string | null }) {
  const result = await confirmVisit(prisma, {
    organizationId: ORG,
    salonId: SALON,
    barberId,
    customerId: input.customerId === undefined ? customerId : input.customerId,
    serviceIds: [serviceId],
    grossAmount: 60,
    paymentMethod: "CASH",
    paymentConfirmed: true,
    appointmentId: input.appointmentId ?? null,
    idempotencyKey: nextKey("confirm"),
  });
  createdVisitIds.push(result.visit.id);
  return result;
}

describe("appointment ↔ visit completion", () => {
  beforeAll(async () => {
    barberId = await makeBarber("main");
    otherBarberId = await makeBarber("other");
    const cashSession = await openCashSession(prisma, { barberId });
    createdCashSessionIds.push(cashSession.cashSession.id);

    const service = await prisma.service.create({
      data: { organizationId: ORG, salonId: SALON, name: `apt-visit-svc-${Date.now()}`, defaultPrice: 60, isActive: true },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);

    customerId = await makeCustomer("الموعد", 0);
    otherCustomerId = await makeCustomer("آخر", 1);
  });

  afterAll(async () => {
    await prisma.appointment.updateMany({ where: { id: { in: createdAppointmentIds } }, data: { visitId: null } });
    await prisma.appointment.deleteMany({ where: { id: { in: createdAppointmentIds } } });
    await prisma.auditLog.deleteMany({ where: { actorBarberId: { in: createdBarberIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visitService.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.cashCustodyMovement.deleteMany({ where: { barberId: { in: createdBarberIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.barberCashBalance.deleteMany({ where: { barberId: { in: createdBarberIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdCashSessionIds } } });
    await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("تأكيد الزيارة يقفل موعدها كمكتمل ويربطه بها في معاملة واحدة", async () => {
    const appointmentId = await makeAppointment({});
    const result = await confirm({ appointmentId });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("COMPLETED");
    expect(appointment.visitId).toBe(result.visit.id);
  });

  it("الزيارة بلا موعد تبقى ممكنة ولا تمسّ أي موعد", async () => {
    const appointmentId = await makeAppointment({});
    const result = await confirm({ appointmentId: null });

    expect(result.visit.id).toBeTruthy();
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("ARRIVED");
    expect(appointment.visitId).toBeNull();
  });

  it("موعد حلاق آخر لا يُقفل، والزيارة تنجح رغم ذلك", async () => {
    const appointmentId = await makeAppointment({ barberId: otherBarberId });
    const result = await confirm({ appointmentId });

    expect(result.visit.id).toBeTruthy();
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("ARRIVED");
    expect(appointment.visitId).toBeNull();
  });

  it("موعد عميل آخر لا يُقفل بزيارة هذا العميل", async () => {
    const appointmentId = await makeAppointment({ customerId: otherCustomerId });
    await confirm({ appointmentId });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("ARRIVED");
    expect(appointment.visitId).toBeNull();
  });

  it("موعد مقفول سلفًا لا يُعاد ربطه بزيارة ثانية", async () => {
    const appointmentId = await makeAppointment({});
    const first = await confirm({ appointmentId });
    const second = await confirm({ appointmentId });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.visitId).toBe(first.visit.id);
    expect(appointment.visitId).not.toBe(second.visit.id);
  });

  it("موعد ملغى لا يُقفل بزيارة", async () => {
    const appointmentId = await makeAppointment({});
    await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });
    await confirm({ appointmentId });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("CANCELLED");
    expect(appointment.visitId).toBeNull();
  });

  it("موعد بلا حلاق مُسند يقفله من قدّم الخدمة فعلًا", async () => {
    const appointmentId = await makeAppointment({ barberId: null });
    const result = await confirm({ appointmentId });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("COMPLETED");
    expect(appointment.visitId).toBe(result.visit.id);
  });

  it("سجل التدقيق يفرّق بين الموعد المطلوب والموعد المقفول فعلًا", async () => {
    const appointmentId = await makeAppointment({ barberId: otherBarberId });
    const result = await confirm({ appointmentId });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "visit.confirmed", entityId: result.visit.id },
    });
    const after = log.after as Record<string, unknown>;
    expect(after.requestedAppointmentId).toBe(appointmentId);
    expect(after.completedAppointmentId).toBeNull();
  });

  it("الشاشة والقفل يتفقان: ما لا تعرضه findCloseableAppointment لا يُقفل", async () => {
    const foreign = await makeAppointment({ barberId: otherBarberId });
    const mine = await makeAppointment({});
    const scope = { organizationId: ORG, salonId: SALON, barberId, customerId };

    expect(await findCloseableAppointment(prisma, { ...scope, appointmentId: foreign })).toBeNull();
    expect(await findCloseableAppointment(prisma, { ...scope, appointmentId: mine })).toMatchObject({ id: mine });

    // وبعد القفل تختفي من الشاشة أيضًا، فلا تُعرض مرتين.
    await confirm({ appointmentId: mine });
    expect(await findCloseableAppointment(prisma, { ...scope, appointmentId: mine })).toBeNull();
  });

  it("الضبط اليدوي لـCOMPLETED يبقى مرفوضًا — الإقفال يمرّ بالزيارة وحدها", async () => {
    const appointmentId = await makeAppointment({});
    await expect(
      updateAppointmentStatus(prisma, appointmentId, "COMPLETED", { organizationId: ORG, salonIds: [SALON] }),
    ).rejects.toThrow(/يكتمل الموعد تلقائيًا/);
  });
});
