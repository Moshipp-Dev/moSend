import { z } from "zod";

import {
  createTRPCRouter,
  teamAdminProcedure,
  teamMemberProcedure,
} from "~/server/api/trpc";
import {
  createCheckoutSessionForTeam,
  getManageSessionUrl,
} from "~/server/billing/payments";
import { getActiveGateway } from "~/server/payments/gateway-registry";
import { db } from "~/server/db";
import { TeamService } from "~/server/service/team-service";
import { PlanService } from "~/server/service/plan-service";
import { getThisMonthUsage } from "~/server/service/usage-service";

export const billingRouter = createTRPCRouter({
  createCheckoutSession: teamAdminProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await createCheckoutSessionForTeam(
        ctx.team.id,
        input.planId,
      );
      return result.url;
    }),

  getManageSessionUrl: teamAdminProcedure.mutation(async ({ ctx }) => {
    return await getManageSessionUrl(ctx.team.id);
  }),

  getActiveGateway: teamAdminProcedure.query(async () => {
    const gateway = await getActiveGateway();
    return { provider: gateway.provider };
  }),

  getThisMonthUsage: teamMemberProcedure.query(async ({ ctx }) => {
    return await getThisMonthUsage(ctx.team.id);
  }),

  getCurrentPlan: teamMemberProcedure.query(async ({ ctx }) => {
    return await PlanService.getPlanForTeam(ctx.team.id);
  }),

  getSubscriptionDetails: teamMemberProcedure.query(async ({ ctx }) => {
    const subscription = await db.subscription.findFirst({
      where: { teamId: ctx.team.id },
      orderBy: { status: "asc" },
    });

    return subscription;
  }),

  updateBillingEmail: teamAdminProcedure
    .input(
      z.object({
        billingEmail: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { billingEmail } = input;

      await TeamService.updateTeam(ctx.team.id, { billingEmail });
    }),
});
