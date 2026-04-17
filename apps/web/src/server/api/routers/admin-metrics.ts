import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const adminMetricsRouter = createTRPCRouter({
  dashboard: adminProcedure.query(async () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [totalTeams, activeTeams, blockedTeams, plans] = await Promise.all([
      db.team.count(),
      db.team.count({ where: { isActive: true } }),
      db.team.count({ where: { isBlocked: true } }),
      db.pricingPlan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const teamsPerPlanRaw = await db.team.groupBy({
      by: ["pricingPlanId"],
      _count: { _all: true },
    });

    const teamsPerPlan = plans.map((plan) => {
      const row = teamsPerPlanRaw.find((r) => r.pricingPlanId === plan.id);
      const count = row?._count._all ?? 0;
      return {
        planId: plan.id,
        key: plan.key,
        name: plan.name,
        count,
        priceMonthly: Number(plan.priceMonthly),
        currency: plan.currency,
        revenue: count * Number(plan.priceMonthly),
      };
    });

    const emailsThisMonth = await db.dailyEmailUsage.aggregate({
      where: { date: { startsWith: monthKey } },
      _sum: { sent: true, delivered: true, bounced: true, complained: true },
    });

    const revenueMonthly = teamsPerPlan.reduce((acc, p) => acc + p.revenue, 0);

    return {
      totalTeams,
      activeTeams,
      blockedTeams,
      teamsPerPlan,
      revenueMonthly,
      emailsThisMonth: {
        sent: emailsThisMonth._sum.sent ?? 0,
        delivered: emailsThisMonth._sum.delivered ?? 0,
        bounced: emailsThisMonth._sum.bounced ?? 0,
        complained: emailsThisMonth._sum.complained ?? 0,
      },
    };
  }),
});
