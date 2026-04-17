import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  teamAdminProcedure,
  teamMemberProcedure,
  teamProcedure,
} from "~/server/api/trpc";
import { PlanActivationService } from "~/server/service/plan-activation-service";

export const planActivationRouter = createTRPCRouter({
  // Any logged-in team member can request a plan for themselves. The admin
  // SaaS approves it later. CLIENTs included: the activation targets them
  // individually (user.pricingPlanId) rather than the team.
  request: teamMemberProcedure
    .input(
      z.object({
        planId: z.number(),
        paymentMethod: z.string().max(80).nullable().optional(),
        userNotes: z.string().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return PlanActivationService.createRequest({
        teamId: ctx.team.id,
        planId: input.planId,
        requestedByUserId: ctx.session.user.id,
        targetUserId: ctx.session.user.id,
        paymentMethod: input.paymentMethod,
        userNotes: input.userNotes,
      });
    }),

  cancel: teamMemberProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await PlanActivationService.cancelOwn(
        input.requestId,
        ctx.team.id,
        ctx.session.user.id,
      );
    }),

  listMine: teamMemberProcedure.query(async ({ ctx }) => {
    // Show the caller's own activations. CLIENTs see their individual history;
    // ADMIN/MEMBER see every activation linked to their team.
    if (ctx.teamUser.role === "CLIENT") {
      return PlanActivationService.listForUser(ctx.session.user.id);
    }
    return PlanActivationService.listForTeam(ctx.team.id);
  }),

  // getStatus must only return info to members of the team that owns the
  // request. Using teamProcedure here gives us the caller's team; then we
  // verify the request belongs to that team before exposing anything.
  getStatus: teamProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const req = await PlanActivationService.getById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.teamId !== ctx.team.id) {
        // Don't leak existence to users of other teams
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return {
        id: req.id,
        status: req.status,
        planName: req.plan.name,
        planKey: req.plan.key,
        createdAt: req.createdAt,
        reviewedAt: req.reviewedAt,
        rejectionReason: req.rejectionReason,
      };
    }),
});
