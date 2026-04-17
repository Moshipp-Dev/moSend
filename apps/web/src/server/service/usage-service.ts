import { EmailUsageType, Prisma, Subscription } from "@prisma/client";
import { db } from "../db";
import { format } from "date-fns";

/**
 * Gets the monthly and daily email usage for a single CLIENT user — scoped to
 * the domains they have access to via ClientDomainAccess. Only counts rows in
 * DailyEmailUsage whose domainId is in the user's access list.
 */
export async function getThisMonthUsageForClient(
  teamId: number,
  userId: number,
) {
  const accesses = await db.clientDomainAccess.findMany({
    where: { userId, teamId },
    select: { domainId: true },
  });
  const domainIds = accesses.map((a) => a.domainId);
  if (domainIds.length === 0) {
    return { month: [], day: [] };
  }

  const startDate = format(new Date(), "yyyy-MM-01");
  const today = format(new Date(), "yyyy-MM-dd");
  const domainList = Prisma.join(domainIds);

  const [monthUsage, dayUsage] = await Promise.all([
    db.$queryRaw<Array<{ type: EmailUsageType; sent: number }>>(Prisma.sql`
        SELECT type, SUM(sent)::integer AS sent
        FROM "DailyEmailUsage"
        WHERE "teamId" = ${teamId}
          AND "domainId" IN (${domainList})
          AND "date" >= ${startDate}
        GROUP BY type
      `),
    db.$queryRaw<Array<{ type: EmailUsageType; sent: number }>>(Prisma.sql`
        SELECT type, SUM(sent)::integer AS sent
        FROM "DailyEmailUsage"
        WHERE "teamId" = ${teamId}
          AND "domainId" IN (${domainList})
          AND "date" = ${today}
        GROUP BY type
      `),
  ]);

  return { month: monthUsage, day: dayUsage };
}

/**
 * Gets the monthly and daily usage for a team
 * @param teamId - The team ID to get usage for
 * @param db - Prisma database client
 * @param subscription - Optional subscription to determine billing period start
 * @returns Object containing month and day usage arrays
 */
export async function getThisMonthUsage(teamId: number) {
  const team = await db.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new Error("Team not found");
  }

  let subscription: Subscription | null = null;
  const isPaidPlan = team.plan !== "FREE";

  if (isPaidPlan) {
    subscription = await db.subscription.findFirst({
      where: { teamId: team.id },
      orderBy: { status: "asc" },
    });
  }

  const isoStartDate = subscription?.currentPeriodStart
    ? format(subscription.currentPeriodStart, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-01"); // First day of current month
  const today = format(new Date(), "yyyy-MM-dd");

  const [monthUsage, dayUsage] = await Promise.all([
    // Get month usage
    db.$queryRaw<Array<{ type: EmailUsageType; sent: number }>>`
        SELECT 
          type,
          SUM(sent)::integer AS sent
        FROM "DailyEmailUsage"
        WHERE "teamId" = ${team.id}
        AND "date" >= ${isoStartDate}
        GROUP BY "type"
      `,
    // Get today's usage
    db.$queryRaw<Array<{ type: EmailUsageType; sent: number }>>`
        SELECT 
          type,
          SUM(sent)::integer AS sent
        FROM "DailyEmailUsage"
        WHERE "teamId" = ${team.id}
        AND "date" = ${today}
        GROUP BY "type"
      `,
  ]);

  return {
    month: monthUsage,
    day: dayUsage,
  };
}
