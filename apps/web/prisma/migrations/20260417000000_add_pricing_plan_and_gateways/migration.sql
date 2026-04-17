-- AlterTable: add isAdmin to User
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('MANUAL', 'STRIPE', 'DLOCALGO');

-- CreateTable: PricingPlan
CREATE TABLE "PricingPlan" (
    "id"              SERIAL        NOT NULL,
    "key"             TEXT          NOT NULL,
    "name"            TEXT          NOT NULL,
    "description"     TEXT,
    "emailsPerMonth"  INTEGER       NOT NULL DEFAULT -1,
    "emailsPerDay"    INTEGER       NOT NULL DEFAULT -1,
    "maxDomains"      INTEGER       NOT NULL DEFAULT -1,
    "maxContactBooks" INTEGER       NOT NULL DEFAULT -1,
    "maxTeamMembers"  INTEGER       NOT NULL DEFAULT -1,
    "maxWebhooks"     INTEGER       NOT NULL DEFAULT -1,
    "priceMonthly"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency"        TEXT          NOT NULL DEFAULT 'USD',
    "gatewayPriceIds" JSONB         NOT NULL DEFAULT '{}',
    "perks"           JSONB         NOT NULL DEFAULT '[]',
    "isActive"        BOOLEAN       NOT NULL DEFAULT true,
    "isEnterprise"    BOOLEAN       NOT NULL DEFAULT false,
    "isPopular"       BOOLEAN       NOT NULL DEFAULT false,
    "sortOrder"       INTEGER       NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "PricingPlan_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "PricingPlan_key_key" UNIQUE ("key")
);

-- CreateTable: PaymentGateway
CREATE TABLE "PaymentGateway" (
    "id"                SERIAL          NOT NULL,
    "provider"          "GatewayProvider" NOT NULL,
    "isActive"          BOOLEAN         NOT NULL DEFAULT false,
    "isDefault"         BOOLEAN         NOT NULL DEFAULT false,
    "credentialsCipher" TEXT,
    "credentialsIv"     TEXT,
    "credentialsTag"    TEXT,
    "settings"          JSONB           NOT NULL DEFAULT '{}',
    "lastTestedAt"      TIMESTAMP(3),
    "lastError"         TEXT,
    "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "PaymentGateway_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "PaymentGateway_provider_key" UNIQUE ("provider")
);

-- AlterTable: add pricingPlanId to Team
ALTER TABLE "Team" ADD COLUMN "pricingPlanId" INTEGER;

-- AddForeignKey: Team.pricingPlanId → PricingPlan.id (SET NULL on delete)
ALTER TABLE "Team"
  ADD CONSTRAINT "Team_pricingPlanId_fkey"
  FOREIGN KEY ("pricingPlanId") REFERENCES "PricingPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: 7 pricing plans (FREE + 6 mosend.dev tiers) with placeholder values
-- User edits these from /admin/plans panel.
INSERT INTO "PricingPlan" ("key", "name", "description", "emailsPerMonth", "emailsPerDay", "maxDomains", "maxContactBooks", "maxTeamMembers", "maxWebhooks", "priceMonthly", "currency", "perks", "isActive", "isEnterprise", "isPopular", "sortOrder", "updatedAt") VALUES
  ('free',         'Free',         'Plan gratuito para comenzar',             3000,  100, 1, 1, 1, 1, 0,     'USD', '["Envía hasta 3000 correos por mes","Envía hasta 100 correos por día","1 libreta de contactos","1 dominio","1 miembro del equipo"]'::jsonb, true, false, false, 0, NOW()),
  ('chispa',       'Chispa',       'Para proyectos pequeños',                    -1,   -1, -1, -1, -1, -1, 0, 'USD', '[]'::jsonb, true, false, false, 1, NOW()),
  ('cohete',       'Cohete',       'Para equipos en crecimiento',                -1,   -1, -1, -1, -1, -1, 0, 'USD', '[]'::jsonb, true, false, false, 2, NOW()),
  ('estela',       'Estela',       'Para negocios activos',                      -1,   -1, -1, -1, -1, -1, 0, 'USD', '[]'::jsonb, true, false, false, 3, NOW()),
  ('orbita',       'Órbita',       'Ideal para empresas en expansión',           -1,   -1, -1, -1, -1, -1, 0, 'USD', '[]'::jsonb, true, false, true,  4, NOW()),
  ('supernova',    'Supernova',    'Para alto volumen transaccional',            -1,   -1, -1, -1, -1, -1, 0, 'USD', '[]'::jsonb, true, false, false, 5, NOW()),
  ('constelacion', 'Constelación', 'Enterprise con SLA e infraestructura dedicada', -1, -1, -1, -1, -1, -1, 0, 'USD', '[]'::jsonb, true, true,  false, 6, NOW());

-- Backfill: teams on legacy FREE enum → pricing plan 'free'; legacy BASIC → 'orbita' (closest paid tier).
UPDATE "Team"
SET    "pricingPlanId" = (SELECT "id" FROM "PricingPlan" WHERE "key" = 'free')
WHERE  "plan" = 'FREE' AND "pricingPlanId" IS NULL;

UPDATE "Team"
SET    "pricingPlanId" = (SELECT "id" FROM "PricingPlan" WHERE "key" = 'orbita')
WHERE  "plan" = 'BASIC' AND "pricingPlanId" IS NULL;

-- Seed: payment gateways. MANUAL active+default; STRIPE/DLOCALGO inactive.
INSERT INTO "PaymentGateway" ("provider", "isActive", "isDefault", "settings", "updatedAt") VALUES
  ('MANUAL',   true,  true,  '{}'::jsonb, NOW()),
  ('STRIPE',   false, false, '{}'::jsonb, NOW()),
  ('DLOCALGO', false, false, '{}'::jsonb, NOW());
