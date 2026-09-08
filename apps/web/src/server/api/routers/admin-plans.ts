import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { PlanService } from "~/server/service/plan-service";

const planInput = z.object({
  key: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "key must be lowercase alphanumeric"),
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  emailsPerMonth: z.number().int().min(-1),
  emailsPerDay: z.number().int().min(-1),
  maxDomains: z.number().int().min(-1),
  maxContactBooks: z.number().int().min(-1),
  maxTeamMembers: z.number().int().min(-1),
  maxWebhooks: z.number().int().min(-1),
  priceMonthly: z.number().min(0),
  currency: z.string().length(3).default("USD"),
  gatewayPriceIds: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  perks: z.array(z.string().max(200)).default([]),
  isActive: z.boolean().default(true),
  isEnterprise: z.boolean().default(false),
  isPopular: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const adminPlansRouter = createTRPCRouter({
  list: adminProcedure.query(async () => {
    return db.pricingPlan.findMany({
      orderBy: { sortOrder: "asc" },
    });
  }),

  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const plan = await db.pricingPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      return plan;
    }),

  create: adminProcedure.input(planInput).mutation(async ({ input }) => {
    const existing = await db.pricingPlan.findUnique({
      where: { key: input.key },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Plan with key "${input.key}" already exists`,
      });
    }
    const created = await db.pricingPlan.create({
      data: {
        ...input,
        priceMonthly: input.priceMonthly,
      },
    });
    await PlanService.invalidate();
    return created;
  }),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: planInput.partial() }))
    .mutation(async ({ input }) => {
      const updated = await db.pricingPlan.update({
        where: { id: input.id },
        data: input.data,
      });
      await PlanService.invalidate();
      return updated;
    }),

  reorder: adminProcedure
    .input(z.object({ orderedIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await db.$transaction(
        input.orderedIds.map((id, index) =>
          db.pricingPlan.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );
      await PlanService.invalidate();
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Anything that still points at the plan (teams, CLIENT users,
      // activation history, invoices) makes a hard delete impossible or
      // destroys the audit trail, so those plans are retired instead.
      const [teamCount, userCount, activationCount, invoiceCount] = await Promise.all([
        db.team.count({ where: { pricingPlanId: input.id } }),
        db.user.count({ where: { pricingPlanId: input.id } }),
        db.planActivationRequest.count({ where: { planId: input.id } }),
        db.planInvoice.count({ where: { planId: input.id } }),
      ]);
      const referenced = teamCount + userCount + activationCount + invoiceCount > 0;
      if (referenced) {
        await db.pricingPlan.update({
          where: { id: input.id },
          data: { isActive: false },
        });
      } else {
        await db.pricingPlan.delete({ where: { id: input.id } });
      }
      await PlanService.invalidate();
      return { mode: referenced ? ("retired" as const) : ("deleted" as const) };
    }),
});
