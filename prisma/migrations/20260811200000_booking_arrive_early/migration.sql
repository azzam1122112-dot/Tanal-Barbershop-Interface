-- كم دقيقة يُطلب من العميل الحضور قبل موعده. إرشاد عرضٍ لا قيد:
-- لا يزحزح `Appointment.startAt` ولا يدخل حساب التداخل.
ALTER TABLE "SystemSettings" ADD COLUMN "bookingArriveEarlyMinutes" INTEGER NOT NULL DEFAULT 10;
