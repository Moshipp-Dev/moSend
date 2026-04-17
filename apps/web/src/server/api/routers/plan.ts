import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { PlanService } from "~/server/service/plan-service";

export const planRouter = createTRPCRouter({
  getPublicList: publicProcedure.query(async () => {
    return PlanService.getPublicPlans();
  }),

  getByKey: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const plan = await PlanService.getPlanByKey(input.key);
      if (!plan || !plan.isActive) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return plan;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const plan = await PlanService.getPlanById(input.id);
      if (!plan || !plan.isActive) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return plan;
    }),
});
