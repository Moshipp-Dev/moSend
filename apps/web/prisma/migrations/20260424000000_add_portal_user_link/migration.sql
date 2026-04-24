-- AlterTable
ALTER TABLE "User" ADD COLUMN "portalUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_portalUserId_key" ON "User"("portalUserId");
