import { LimitReason } from "~/lib/constants/plans";
import { env } from "~/env";
import { getThisMonthUsage } from "./usage-service";
import { TeamService } from "./team-service";
import { PlanService } from "./plan-service";
import { withCache } from "../redis";
import { db } from "../db";
import { logger } from "../logger/log";

function isLimitExceeded(current: number, limit: number): boolean {
  if (limit === -1) return false;
  return current >= limit;
}

export class LimitService {
  static async checkDomainLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const limits = await PlanService.getLimitsForTeam(teamId);
    const currentCount = await db.domain.count({ where: { teamId } });
    const limit = limits.maxDomains;

    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.DOMAIN,
      };
    }

    return { isLimitReached: false, limit };
  }

  static async checkContactBookLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const limits = await PlanService.getLimitsForTeam(teamId);
    const currentCount = await db.contactBook.count({ where: { teamId } });
    const limit = limits.maxContactBooks;

    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.CONTACT_BOOK,
      };
    }

    return { isLimitReached: false, limit };
  }

  static async checkTeamMemberLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const limits = await PlanService.getLimitsForTeam(teamId);
    const currentCount = await db.teamUser.count({ where: { teamId } });
    const limit = limits.maxTeamMembers;

    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.TEAM_MEMBER,
      };
    }

    return { isLimitReached: false, limit };
  }

  static async checkWebhookLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const limits = await PlanService.getLimitsForTeam(teamId);
    const currentCount = await db.webhook.count({ where: { teamId } });
    const limit = limits.maxWebhooks;

    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.WEBHOOK,
      };
    }

    return { isLimitReached: false, limit };
  }

  // Checks email sending limits and also triggers usage notifications.
  // Side effects:
  // - Sends "warning" emails when nearing daily/monthly limits (rate-limited in TeamService)
  // - Sends "limit reached" notifications when limits are exceeded (rate-limited in TeamService)
  // - Teams with inactive subscriptions are treated like FREE plans for monthly limit alerts
  static async checkEmailLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
    available?: number;
  }> {
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const team = await TeamService.getTeamCached(teamId);

    if (team.isBlocked) {
      return {
        isLimitReached: true,
        limit: 0,
        reason: LimitReason.EMAIL_BLOCKED,
      };
    }

    const plan = await PlanService.getPlanForTeam(teamId);
    const isFreeTier = plan?.key === "free" || !plan;

    const usage = await withCache(
      `usage:this-month:${teamId}`,
      () => getThisMonthUsage(teamId),
      { ttlSeconds: 60 },
    );

    const dailyUsage = usage.day.reduce((acc, curr) => acc + curr.sent, 0);
    // Prefer the plan's daily limit; fall back to the team-specific override only
    // when the plan says "unlimited" but admin set a manual cap via team.dailyEmailLimit.
    const planDailyLimit = plan?.emailsPerDay ?? -1;
    const dailyLimit =
      planDailyLimit === -1 && team.dailyEmailLimit > 0
        ? team.dailyEmailLimit
        : planDailyLimit;

    logger.info(
      { dailyUsage, dailyLimit, planKey: plan?.key, team },
      `[LimitService]: Daily usage and limit`,
    );

    if (isLimitExceeded(dailyUsage, dailyLimit)) {
      try {
        await TeamService.maybeNotifyEmailLimitReached(
          teamId,
          dailyLimit,
          LimitReason.EMAIL_DAILY_LIMIT_REACHED,
        );
      } catch (e) {
        logger.warn(
          { err: e },
          "Failed to send daily limit reached notification",
        );
      }

      return {
        isLimitReached: true,
        limit: dailyLimit,
        reason: LimitReason.EMAIL_DAILY_LIMIT_REACHED,
        available: dailyLimit - dailyUsage,
      };
    }

    if (isFreeTier) {
      const monthlyUsage = usage.month.reduce(
        (acc, curr) => acc + curr.sent,
        0,
      );
      const monthlyLimit = plan?.emailsPerMonth ?? 3000;

      logger.info(
        { monthlyUsage, monthlyLimit, team, isActive: team.isActive },
        `[LimitService]: Monthly usage and limit (FREE plan or inactive subscription)`,
      );

      if (
        monthlyLimit > 0 &&
        monthlyUsage / monthlyLimit > 0.8 &&
        monthlyUsage < monthlyLimit
      ) {
        await TeamService.sendWarningEmail(
          teamId,
          monthlyUsage,
          monthlyLimit,
          LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED,
        );
      }

      if (isLimitExceeded(monthlyUsage, monthlyLimit)) {
        try {
          await TeamService.maybeNotifyEmailLimitReached(
            teamId,
            monthlyLimit,
            LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED,
          );
        } catch (e) {
          logger.warn(
            { err: e },
            "Failed to send monthly limit reached notification",
          );
        }

        return {
          isLimitReached: true,
          limit: monthlyLimit,
          reason: LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED,
          available: monthlyLimit - monthlyUsage,
        };
      }
    }

    if (
      dailyLimit !== -1 &&
      dailyLimit > 0 &&
      dailyLimit - dailyUsage > 0 &&
      (dailyLimit - dailyUsage) / dailyLimit < 0.2
    ) {
      try {
        await TeamService.sendWarningEmail(
          teamId,
          dailyUsage,
          dailyLimit,
          LimitReason.EMAIL_DAILY_LIMIT_REACHED,
        );
      } catch (e) {
        logger.warn({ err: e }, "Failed to send daily warning email");
      }
    }

    return {
      isLimitReached: false,
      limit: dailyLimit,
      available: dailyLimit === -1 ? -1 : dailyLimit - dailyUsage,
    };
  }
}
