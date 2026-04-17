import { z } from "zod";

import {
  createTRPCRouter,
  teamAdminProcedure,
  teamProcedure,
} from "~/server/api/trpc";
import {
  createCheckoutSessionForTeam,
  getManageSessionUrl,
} from "~/server/billing/payments";
import { getActiveGateway } from "~/server/payments/gateway-registry";
import { db } from "~/server/db";
import { TeamService } from "~/server/service/team-service";
import { PlanService } from "~/server/service/plan-service";
import {
  getThisMonthUsage,
  getThisMonthUsageForClient,
} from "~/server/service/usage-service";

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

  // teamProcedure (not teamMemberProcedure) so CLIENTs can see their own
  // billing state. The payload is scoped to the caller: CLIENTs get their
  // per-user plan and usage; ADMIN/MEMBER get the team-wide plan and usage.
  getThisMonthUsage: teamProcedure.query(async ({ ctx }) => {
    if (ctx.teamUser.role === "CLIENT") {
      return getThisMonthUsageForClient(ctx.team.id, ctx.session.user.id);
    }
    return getThisMonthUsage(ctx.team.id);
  }),

  getCurrentPlan: teamProcedure.query(async ({ ctx }) => {
    return PlanService.getPlanForCaller(
      ctx.session.user.id,
      ctx.team.id,
      ctx.teamUser.role,
    );
  }),

  getSubscriptionDetails: teamProcedure.query(async ({ ctx }) => {
    // Stripe subscription info is team-wide by design; CLIENTs see the team's
    // subscription if any (usually none in the manual-activation flow).
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
