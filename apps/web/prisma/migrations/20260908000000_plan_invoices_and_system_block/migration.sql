-- CreateEnum
CREATE TYPE "PlanInvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "blockedBySystem" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlanInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER,
    "activationRequestId" TEXT,
    "planId" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PlanInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanInvoice_number_key" ON "PlanInvoice"("number");

-- CreateIndex
CREATE INDEX "PlanInvoice_userId_status_idx" ON "PlanInvoice"("userId", "status");

-- CreateIndex
CREATE INDEX "PlanInvoice_teamId_issuedAt_idx" ON "PlanInvoice"("teamId", "issuedAt" DESC);

-- AddForeignKey
ALTER TABLE "PlanInvoice" ADD CONSTRAINT "PlanInvoice_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanInvoice" ADD CONSTRAINT "PlanInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
