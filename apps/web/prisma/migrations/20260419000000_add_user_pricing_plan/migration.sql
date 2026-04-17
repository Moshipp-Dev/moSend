-- Per-user pricing plan: CLIENTs get their own plan with their own limits,
-- independent of the team's plan (if any). Additive, nullable — rollback-safe.

-- AlterTable: User.pricingPlanId
ALTER TABLE "User" ADD COLUMN "pricingPlanId" INTEGER;

-- AlterTable: PlanActivationRequest.targetUserId — points to the CLIENT whose
-- plan changes when the request is approved.
ALTER TABLE "PlanActivationRequest" ADD COLUMN "targetUserId" INTEGER;

-- FKs (SET NULL on delete so we never lose PricingPlan rows because of a user).
ALTER TABLE "User"
  ADD CONSTRAINT "User_pricingPlanId_fkey"
  FOREIGN KEY ("pricingPlanId") REFERENCES "PricingPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanActivationRequest"
  ADD CONSTRAINT "PlanActivationRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for fast "my activations" lookups by CLIENT.
CREATE INDEX "PlanActivationRequest_targetUserId_idx" ON "PlanActivationRequest"("targetUserId");
