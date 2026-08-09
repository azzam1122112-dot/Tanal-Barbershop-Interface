-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "bookingCloseMinute" INTEGER NOT NULL DEFAULT 1380,
ADD COLUMN     "bookingClosedWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bookingHorizonDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "bookingLeadMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "bookingMaxActivePerCustomer" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "bookingOpenMinute" INTEGER NOT NULL DEFAULT 960,
ADD COLUMN     "bookingSlotMinutes" INTEGER NOT NULL DEFAULT 30;
