import { z } from "zod";
import { PlanActivationStatus } from "@prisma/client";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { PlanActivationService } from "~/server/service/plan-activation-service";

export const adminActivationsRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z
        .object({
          status: z.nativeEnum(PlanActivationStatus).optional(),
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
        })
        .default({ page: 1, pageSize: 25 }),
    )
    .query(async ({ input }) => {
      return PlanActivationService.listForAdmin(input);
    }),

  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return PlanActivationService.getById(input.id);
    }),

  approve: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        paymentReference: z.string().max(200).nullable().optional(),
        adminNotes: z.string().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return PlanActivationService.approve({
        requestId: input.requestId,
        reviewedByUserId: ctx.session.user.id,
        paymentReference: input.paymentReference,
        adminNotes: input.adminNotes,
      });
    }),

  reject: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        rejectionReason: z.string().min(3).max(500),
        adminNotes: z.string().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return PlanActivationService.reject({
        requestId: input.requestId,
        reviewedByUserId: ctx.session.user.id,
        rejectionReason: input.rejectionReason,
        adminNotes: input.adminNotes,
      });
    }),

  createManual: adminProcedure
    .input(
      z.object({
        teamId: z.number(),
        planId: z.number(),
        targetUserId: z.number().nullable().optional(),
        paymentMethod: z.string().max(80).nullable().optional(),
        paymentReference: z.string().max(200).nullable().optional(),
        adminNotes: z.string().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return PlanActivationService.manualAssign({
        teamId: input.teamId,
        planId: input.planId,
        targetUserId: input.targetUserId,
        adminUserId: ctx.session.user.id,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        adminNotes: input.adminNotes,
      });
    }),
});
