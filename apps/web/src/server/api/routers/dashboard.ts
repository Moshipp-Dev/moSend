import { z } from "zod";
import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { emailTimeSeries, reputationMetricsData } from "~/server/service/dashboard-service";

export const dashboardRouter = createTRPCRouter({
  emailTimeSeries: teamProcedure
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        domain: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { team } = ctx;

      let domainId = input.domain;
      if (ctx.teamUser.role === "CLIENT") {
        const accesses = await ctx.db.clientDomainAccess.findMany({
          where: { userId: ctx.teamUser.userId, teamId: team.id },
          select: { domainId: true },
        });
        const clientDomainIds = accesses.map((a) => a.domainId);
        domainId = input.domain && clientDomainIds.includes(input.domain)
          ? input.domain
          : clientDomainIds[0];
      }

      const response = await emailTimeSeries({
        team,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        domain: domainId,
      });
      return response;
    }),

  reputationMetricsData: teamProcedure
    .input(
      z.object({
        domain: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { team } = ctx;

      let domainId = input.domain;
      if (ctx.teamUser.role === "CLIENT") {
        const accesses = await ctx.db.clientDomainAccess.findMany({
          where: { userId: ctx.teamUser.userId, teamId: team.id },
          select: { domainId: true },
        });
        const clientDomainIds = accesses.map((a) => a.domainId);
        domainId = input.domain && clientDomainIds.includes(input.domain)
          ? input.domain
          : clientDomainIds[0];
      }

      const response = await reputationMetricsData({ team, domain: domainId });
      return response;
    }),
});
