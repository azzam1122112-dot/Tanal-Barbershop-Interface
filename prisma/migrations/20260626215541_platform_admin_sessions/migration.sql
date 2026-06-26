-- AlterTable
ALTER TABLE "Session" DROP COLUMN "platformAdmin",
ADD COLUMN     "platformAdminId" TEXT,
ALTER COLUMN "role" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Session_platformAdminId_idx" ON "Session"("platformAdminId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

