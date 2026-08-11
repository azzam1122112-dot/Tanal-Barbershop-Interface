-- الخدمات المطلوبة في الموعد: مصدر مدّته بدل الرقم الثابت 30.
-- جدول سطور على نمط "VisitService": لا يكرّر organizationId، والعزل محفّز
-- يقارن مؤسسة الموعد بمؤسسة الخدمة (انظر 20260811010000_security_hardening).
CREATE TABLE "AppointmentService" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "estimatedPrice" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppointmentService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentService_appointmentId_serviceId_key" ON "AppointmentService"("appointmentId", "serviceId");
CREATE INDEX "AppointmentService_appointmentId_idx" ON "AppointmentService"("appointmentId");
CREATE INDEX "AppointmentService_serviceId_idx" ON "AppointmentService"("serviceId");

ALTER TABLE "AppointmentService" ADD CONSTRAINT "AppointmentService_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- بلا CASCADE على الخدمة: حذف خدمة من الكتالوج لا يجوز أن يمحو سطرًا من موعد
-- قائم فتنقص مدّته صامتة. الكتالوج يُعطَّل لا يُحذف (قاعدة الحذف مقابل التعطيل).
ALTER TABLE "AppointmentService" ADD CONSTRAINT "AppointmentService_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- عزل المستأجرين: جدول السطور لا يحمل organizationId، فيُقارن الأبوان.
CREATE FUNCTION enforce_appointment_service_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "organizationId" FROM "Appointment" WHERE "id" = NEW."appointmentId") IS DISTINCT FROM
     (SELECT "organizationId" FROM "Service" WHERE "id" = NEW."serviceId")
  THEN RAISE EXCEPTION 'cross-tenant AppointmentService relation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "AppointmentService_tenant_guard" BEFORE INSERT OR UPDATE ON "AppointmentService"
  FOR EACH ROW EXECUTE FUNCTION enforce_appointment_service_tenant();
