import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { GatewayProvider } from "@prisma/client";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { encryptJSON } from "~/server/utils/crypto-aes";
import { getGatewayByProvider } from "~/server/payments/gateway-registry";

const providerEnum = z.nativeEnum(GatewayProvider);

export const adminGatewaysRouter = createTRPCRouter({
  list: adminProcedure.query(async () => {
    const rows = await db.paymentGateway.findMany({
      orderBy: { provider: "asc" },
    });
    return rows.map(({ credentialsCipher, credentialsIv, credentialsTag, ...rest }) => ({
      ...rest,
      hasCredentials: Boolean(credentialsCipher && credentialsIv && credentialsTag),
    }));
  }),

  update: adminProcedure
    .input(
      z.object({
        provider: providerEnum,
        isActive: z.boolean().optional(),
        credentials: z.record(z.string(), z.unknown()).nullable().optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const data: Record<string, unknown> = {};
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.settings !== undefined) data.settings = input.settings;

      if (input.credentials === null) {
        data.credentialsCipher = null;
        data.credentialsIv = null;
        data.credentialsTag = null;
      } else if (input.credentials !== undefined) {
        const encrypted = encryptJSON(input.credentials);
        data.credentialsCipher = encrypted.cipher;
        data.credentialsIv = encrypted.iv;
        data.credentialsTag = encrypted.tag;
      }

      const updated = await db.paymentGateway.update({
        where: { provider: input.provider },
        data,
      });
      const { credentialsCipher, credentialsIv, credentialsTag, ...safe } = updated;
      return {
        ...safe,
        hasCredentials: Boolean(credentialsCipher && credentialsIv && credentialsTag),
      };
    }),

  setDefault: adminProcedure
    .input(z.object({ provider: providerEnum }))
    .mutation(async ({ input }) => {
      const target = await db.paymentGateway.findUnique({
        where: { provider: input.provider },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (!target.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activa la pasarela antes de marcarla como default",
        });
      }

      await db.$transaction([
        db.paymentGateway.updateMany({ data: { isDefault: false } }),
        db.paymentGateway.update({
          where: { provider: input.provider },
          data: { isDefault: true },
        }),
      ]);
    }),

  test: adminProcedure
    .input(z.object({ provider: providerEnum }))
    .mutation(async ({ input }) => {
      const gateway = await getGatewayByProvider(input.provider);
      if (!gateway) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await gateway.testConnection();
      await db.paymentGateway.update({
        where: { provider: input.provider },
        data: {
          lastTestedAt: new Date(),
          lastError: result.ok ? null : result.error ?? "unknown error",
        },
      });
      return result;
    }),
});
