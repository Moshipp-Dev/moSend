import { z } from "zod";
import { ApiPermission } from "@prisma/client";

import {
  apiKeyProcedure,
  createTRPCRouter,
  teamProcedure,
} from "~/server/api/trpc";
import {
  addApiKey,
  deleteApiKey,
  updateApiKey,
} from "~/server/service/api-service";

export const apiRouter = createTRPCRouter({
  createToken: teamProcedure
    .input(
      z.object({
        name: z.string(),
        permission: z.nativeEnum(ApiPermission),
        domainId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // CLIENT can only create keys scoped to their assigned domains
      if (ctx.teamUser.role === "CLIENT" && input.domainId) {
        const access = await ctx.db.clientDomainAccess.findUnique({
          where: { userId_domainId: { userId: ctx.teamUser.userId, domainId: input.domainId } },
        });
        if (!access) {
          throw new Error("No tienes acceso a ese dominio");
        }
      }
      return await addApiKey({
        name: input.name,
        permission: input.permission,
        teamId: ctx.team.id,
        domainId: input.domainId,
      });
    }),

  getApiKeys: teamProcedure.query(async ({ ctx }) => {
    let domainFilter: { domainId: { in: number[] } } | undefined;
    if (ctx.teamUser.role === "CLIENT") {
      const accesses = await ctx.db.clientDomainAccess.findMany({
        where: { userId: ctx.teamUser.userId, teamId: ctx.team.id },
        select: { domainId: true },
      });
      domainFilter = { domainId: { in: accesses.map((a) => a.domainId) } };
    }

    const keys = await ctx.db.apiKey.findMany({
      where: {
        teamId: ctx.team.id,
        ...domainFilter,
      },
      select: {
        id: true,
        name: true,
        permission: true,
        partialToken: true,
        lastUsed: true,
        createdAt: true,
        domainId: true,
        domain: {
          select: {
            name: true,
          },
        },
        },
      orderBy: {
        createdAt: "desc",
      },
    });

    return keys;
  }),

  updateApiKey: apiKeyProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        domainId: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await updateApiKey({
        id: input.id,
        teamId: ctx.team.id,
        name: input.name,
        domainId: input.domainId,
      });
    }),

  deleteApiKey: apiKeyProcedure.mutation(async ({ input }) => {
    return deleteApiKey(input.id);
  }),
});
