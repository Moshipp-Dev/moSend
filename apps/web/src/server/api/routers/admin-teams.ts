import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { TeamService } from "~/server/service/team-service";
import { PlanService } from "~/server/service/plan-service";

export const adminTeamsRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          planId: z.number().optional(),
          blocked: z.boolean().optional(),
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
        })
        .default({ page: 1, pageSize: 25 }),
    )
    .query(async ({ input }) => {
      const where = {
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" as const } },
                {
                  billingEmail: {
                    contains: input.search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
        ...(input.planId !== undefined ? { pricingPlanId: input.planId } : {}),
        ...(input.blocked !== undefined ? { isBlocked: input.blocked } : {}),
      };

      const [total, teams] = await Promise.all([
        db.team.count({ where }),
        db.team.findMany({
          where,
          include: {
            pricingPlan: true,
            _count: { select: { teamUsers: true, domains: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      return { total, teams, page: input.page, pageSize: input.pageSize };
    }),

  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const team = await db.team.findUnique({
        where: { id: input.id },
        include: {
          pricingPlan: true,
          teamUsers: { include: { user: true } },
          subscription: true,
          _count: {
            select: { domains: true, contactBooks: true, webhookEndpoints: true },
          },
        },
      });
      if (!team) throw new TRPCError({ code: "NOT_FOUND" });
      return team;
    }),

  assignPlan: adminProcedure
    .input(z.object({ teamId: z.number(), planId: z.number() }))
    .mutation(async ({ input }) => {
      const plan = await db.pricingPlan.findUnique({
        where: { id: input.planId },
      });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      const legacyPlan = plan.key === "free" ? "FREE" : "BASIC";
      await TeamService.updateTeam(input.teamId, {
        pricingPlan: { connect: { id: plan.id } },
        plan: legacyPlan,
        isActive: true,
      });
      await PlanService.invalidateTeam(input.teamId);
    }),

  toggleBlock: adminProcedure
    .input(z.object({ teamId: z.number(), isBlocked: z.boolean() }))
    .mutation(async ({ input }) => {
      await TeamService.updateTeam(input.teamId, { isBlocked: input.isBlocked });
    }),

  resetUsage: adminProcedure
    .input(z.object({ teamId: z.number(), date: z.string().optional() }))
    .mutation(async ({ input }) => {
      const where = input.date
        ? { teamId: input.teamId, date: input.date }
        : { teamId: input.teamId };
      await db.dailyEmailUsage.deleteMany({ where });
      await PlanService.invalidateTeam(input.teamId);
    }),
});
