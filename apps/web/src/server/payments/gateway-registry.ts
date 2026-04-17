import type { GatewayProvider, PaymentGateway as PaymentGatewayRow } from "@prisma/client";
import { db } from "~/server/db";
import type { PaymentGateway } from "./gateway";
import { ManualGateway } from "./gateways/manual-gateway";
import { DlocalGoGateway, type DlocalGoCredentials } from "./gateways/dlocalgo-gateway";
import { StripeGateway, type StripeCredentials } from "./gateways/stripe-gateway";
import { decryptJSON } from "~/server/utils/crypto-aes";
import { logger } from "~/server/logger/log";

function extractCredentials<T>(row: PaymentGatewayRow): T | undefined {
  if (!row.credentialsCipher || !row.credentialsIv || !row.credentialsTag) {
    return undefined;
  }
  try {
    return decryptJSON<T>({
      cipher: row.credentialsCipher,
      iv: row.credentialsIv,
      tag: row.credentialsTag,
    });
  } catch (err) {
    logger.error(
      { err, provider: row.provider },
      "[GatewayRegistry] Failed to decrypt credentials",
    );
    return undefined;
  }
}

export function instantiateGateway(row: PaymentGatewayRow): PaymentGateway {
  switch (row.provider) {
    case "MANUAL":
      return new ManualGateway();
    case "DLOCALGO":
      return new DlocalGoGateway(extractCredentials<DlocalGoCredentials>(row));
    case "STRIPE":
      return new StripeGateway(extractCredentials<StripeCredentials>(row));
    default: {
      const exhaustive: never = row.provider;
      throw new Error(`Unknown gateway provider: ${exhaustive as string}`);
    }
  }
}

export async function getActiveGateway(): Promise<PaymentGateway> {
  const row = await db.paymentGateway.findFirst({
    where: { isDefault: true, isActive: true },
  });
  if (!row) return new ManualGateway();
  return instantiateGateway(row);
}

export async function getGatewayByProvider(
  provider: GatewayProvider,
): Promise<PaymentGateway | null> {
  const row = await db.paymentGateway.findUnique({ where: { provider } });
  if (!row) return null;
  return instantiateGateway(row);
}
