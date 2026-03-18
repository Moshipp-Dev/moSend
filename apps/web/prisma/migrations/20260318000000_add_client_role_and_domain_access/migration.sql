-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "TeamInvite" ADD COLUMN "domainIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "ClientDomainAccess" (
    "userId"   INTEGER NOT NULL,
    "domainId" INTEGER NOT NULL,
    "teamId"   INTEGER NOT NULL,
    CONSTRAINT "ClientDomainAccess_userId_domainId_key" UNIQUE ("userId", "domainId"),
    CONSTRAINT "ClientDomainAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientDomainAccess_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientDomainAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClientDomainAccess_userId_teamId_idx" ON "ClientDomainAccess"("userId", "teamId");
