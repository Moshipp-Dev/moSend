import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { PlanActivationService } from "~/server/service/plan-activation-service";

// Operator view of every CLIENT user: the people the SaaS actually bills.
// Each row carries the user's individual plan, the activation that granted
// it (with its expiry) and the block state used to suspend non-payers.
export const adminClientsRouter = createTRPCRouter({
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
        role: "CLIENT" as const,
        user: {
          ...(input.search
            ? {
                OR: [
                  {
                    email: {
                      contains: input.search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    name: {
                      contains: input.search,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              }
            : {}),
          ...(input.planId !== undefined ? { pricingPlanId: input.planId } : {}),
          ...(input.blocked !== undefined ? { isBlocked: input.blocked } : {}),
        },
      };

      const [total, rows] = await Promise.all([
        db.teamUser.count({ where }),
        db.teamUser.findMany({
          where,
          include: {
            team: { select: { id: true, name: true } },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                isBlocked: true,
                blockedReason: true,
                pricingPlan: { select: { id: true, key: true, name: true } },
                _count: { select: { clientDomainAccesses: true } },
                activationsReceived: {
                  where: { status: "APPROVED" },
                  orderBy: { reviewedAt: "desc" },
                  take: 1,
                  select: {
                    id: true,
                    expiresAt: true,
                    reviewedAt: true,
                    plan: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { user: { email: "asc" } },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      const clients = rows.map((r) => ({
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        createdAt: r.user.createdAt,
        team: r.team,
        plan: r.user.pricingPlan,
        domainsCount: r.user._count.clientDomainAccesses,
        isBlocked: r.user.isBlocked,
        blockedReason: r.user.blockedReason,
        activeActivation: r.user.activationsReceived[0] ?? null,
      }));

      return { total, clients, page: input.page, pageSize: input.pageSize };
    }),

  setBlocked: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        blocked: z.boolean(),
        reason: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return PlanActivationService.setUserBlocked(
        input.userId,
        input.blocked,
        input.reason,
      );
    }),
});
