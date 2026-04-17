import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  teamAdminProcedure,
  teamProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { PlanActivationService } from "~/server/service/plan-activation-service";

export const planActivationRouter = createTRPCRouter({
  request: teamAdminProcedure
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
        paymentMethod: input.paymentMethod,
        userNotes: input.userNotes,
      });
    }),

  cancel: teamAdminProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await PlanActivationService.cancelOwn(
        input.requestId,
        ctx.team.id,
        ctx.session.user.id,
      );
    }),

  listMine: teamProcedure.query(async ({ ctx }) => {
    return PlanActivationService.listForTeam(ctx.team.id);
  }),

  getStatus: publicProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ input }) => {
      const req = await PlanActivationService.getById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
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
