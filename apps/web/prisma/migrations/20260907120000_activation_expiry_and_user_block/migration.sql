-- AlterEnum
ALTER TYPE "PlanActivationStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "PlanActivationRequest"
  ADD COLUMN "reminderSentAt" TIMESTAMP(3),
  ADD COLUMN "finalReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "expiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "blockedReason" TEXT;

-- CreateIndex
CREATE INDEX "PlanActivationRequest_status_expiresAt_idx" ON "PlanActivationRequest"("status", "expiresAt");
