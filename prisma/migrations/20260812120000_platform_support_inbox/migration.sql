CREATE TYPE "PlatformSupportStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'SPAM');
CREATE TYPE "PlatformSupportPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "PlatformSupportDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "PlatformSupportConversation" (
    "id" TEXT NOT NULL,
    "participantEmail" TEXT NOT NULL,
    "participantName" TEXT,
    "subject" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "status" "PlatformSupportStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "PlatformSupportPriority" NOT NULL DEFAULT 'NORMAL',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "assignedAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSupportConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSupportMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerEmailId" TEXT,
    "providerEventId" TEXT,
    "direction" "PlatformSupportDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformSupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSupportAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "providerAttachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentDisposition" TEXT,
    "contentId" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformSupportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSupportMessage_providerEmailId_key" ON "PlatformSupportMessage"("providerEmailId");
CREATE UNIQUE INDEX "PlatformSupportMessage_providerEventId_key" ON "PlatformSupportMessage"("providerEventId");
CREATE UNIQUE INDEX "PlatformSupportAttachment_messageId_providerAttachmentId_key" ON "PlatformSupportAttachment"("messageId", "providerAttachmentId");
CREATE INDEX "PlatformSupportConversation_status_lastMessageAt_idx" ON "PlatformSupportConversation"("status", "lastMessageAt");
CREATE INDEX "PlatformSupportConversation_participantEmail_subjectKey_lastMessageAt_idx" ON "PlatformSupportConversation"("participantEmail", "subjectKey", "lastMessageAt");
CREATE INDEX "PlatformSupportConversation_assignedAdminId_status_idx" ON "PlatformSupportConversation"("assignedAdminId", "status");
CREATE INDEX "PlatformSupportMessage_conversationId_createdAt_idx" ON "PlatformSupportMessage"("conversationId", "createdAt");
CREATE INDEX "PlatformSupportMessage_messageId_idx" ON "PlatformSupportMessage"("messageId");
CREATE INDEX "PlatformSupportMessage_sentByAdminId_createdAt_idx" ON "PlatformSupportMessage"("sentByAdminId", "createdAt");
CREATE INDEX "PlatformSupportAttachment_messageId_idx" ON "PlatformSupportAttachment"("messageId");

ALTER TABLE "PlatformSupportConversation"
  ADD CONSTRAINT "PlatformSupportConversation_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformSupportMessage"
  ADD CONSTRAINT "PlatformSupportMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "PlatformSupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformSupportMessage"
  ADD CONSTRAINT "PlatformSupportMessage_sentByAdminId_fkey"
  FOREIGN KEY ("sentByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformSupportAttachment"
  ADD CONSTRAINT "PlatformSupportAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "PlatformSupportMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
