import type { PricingPlan } from "@prisma/client";
import { db } from "../db";
import { withCache, getRedis, redisKey } from "../redis";
import { logger } from "../logger/log";

const PLAN_CACHE_TTL = 60;
const TEAM_PLAN_CACHE_TTL = 60;

type PlanLimits = Pick<
  PricingPlan,
  | "emailsPerMonth"
  | "emailsPerDay"
  | "maxDomains"
  | "maxContactBooks"
  | "maxTeamMembers"
  | "maxWebhooks"
>;

const FALLBACK_FREE_PLAN: PlanLimits = {
  emailsPerMonth: 3000,
  emailsPerDay: 100,
  maxDomains: 1,
  maxContactBooks: 1,
  maxTeamMembers: 1,
  maxWebhooks: 1,
};

export class PlanService {
  static async getPlanForTeam(teamId: number): Promise<PricingPlan | null> {
    return withCache(
      `plan:team:${teamId}`,
      async () => {
        const team = await db.team.findUnique({
          where: { id: teamId },
          select: { pricingPlanId: true, isActive: true, plan: true },
        });
        if (!team) return null;

        if (!team.isActive) return PlanService.getPlanByKey("free");

        if (team.pricingPlanId) {
          const plan = await db.pricingPlan.findUnique({
            where: { id: team.pricingPlanId },
          });
          if (plan && plan.isActive) return plan;
        }

        const legacyKey = team.plan.toLowerCase();
        const mapped = legacyKey === "basic" ? "orbita" : "free";
        return PlanService.getPlanByKey(mapped);
      },
      { ttlSeconds: TEAM_PLAN_CACHE_TTL },
    );
  }

  static async getPlanByKey(key: string): Promise<PricingPlan | null> {
    return withCache(
      `plan:key:${key}`,
      () => db.pricingPlan.findUnique({ where: { key } }),
      { ttlSeconds: PLAN_CACHE_TTL },
    );
  }

  static async getPlanById(id: number): Promise<PricingPlan | null> {
    return withCache(
      `plan:id:${id}`,
      () => db.pricingPlan.findUnique({ where: { id } }),
      { ttlSeconds: PLAN_CACHE_TTL },
    );
  }

  static async getActivePlans(): Promise<PricingPlan[]> {
    return withCache(
      `plan:list:active`,
      () =>
        db.pricingPlan.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        }),
      { ttlSeconds: PLAN_CACHE_TTL },
    );
  }

  static async getPublicPlans(): Promise<PricingPlan[]> {
    const all = await PlanService.getActivePlans();
    return all.filter((p) => p.key !== "free");
  }

  static async getLimitsForTeam(teamId: number): Promise<PlanLimits> {
    const plan = await PlanService.getPlanForTeam(teamId);
    if (!plan) {
      logger.warn({ teamId }, "[PlanService] No plan found, using FREE fallback");
      return FALLBACK_FREE_PLAN;
    }
    return plan;
  }

  static async invalidate(): Promise<void> {
    const redis = getRedis();
    const patterns = [
      redisKey("plan:list:active"),
      redisKey("plan:key:*"),
      redisKey("plan:id:*"),
      redisKey("plan:team:*"),
    ];
    for (const pattern of patterns) {
      if (pattern.includes("*")) {
        const keys = await redis.keys(pattern);
        if (keys.length) await redis.del(...keys);
      } else {
        await redis.del(pattern);
      }
    }
  }

  static async invalidateTeam(teamId: number): Promise<void> {
    const redis = getRedis();
    await redis.del(redisKey(`plan:team:${teamId}`));
  }
}
