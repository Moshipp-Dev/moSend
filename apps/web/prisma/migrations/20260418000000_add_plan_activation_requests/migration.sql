-- CreateEnum
CREATE TYPE "PlanActivationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PlanActivationRequest" (
    "id"                TEXT                  NOT NULL,
    "teamId"            INTEGER               NOT NULL,
    "planId"            INTEGER               NOT NULL,
    "requestedByUserId" INTEGER,
    "status"            "PlanActivationStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod"     TEXT,
    "paymentReference"  TEXT,
    "userNotes"         TEXT,
    "adminNotes"        TEXT,
    "rejectionReason"   TEXT,
    "reviewedByUserId"  INTEGER,
    "reviewedAt"        TIMESTAMP(3),
    "expiresAt"         TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)          NOT NULL,

    CONSTRAINT "PlanActivationRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlanActivationRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanActivationRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PricingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlanActivationRequest_teamId_status_idx" ON "PlanActivationRequest"("teamId", "status");
CREATE INDEX "PlanActivationRequest_status_createdAt_idx" ON "PlanActivationRequest"("status", "createdAt" DESC);
