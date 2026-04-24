import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { TeamService } from "~/server/service/team-service";
import { PlanService } from "~/server/service/plan-service";
import { getThisMonthUsage } from "~/server/service/usage-service";
import { handleError, UnsendApiError } from "../public-api/api-error";
import { requireAdminKey } from "./auth";
import { logger } from "../logger/log";

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

const jsonBody = async <T extends z.ZodTypeAny>(
  raw: unknown,
  schema: T,
): Promise<z.infer<T>> => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  }
  return parsed.data;
};

export function getAdminApp() {
  const app = new Hono().basePath("/api");

  app.onError(handleError);

  app.use("/admin/*", requireAdminKey);

  // Health / identity probe
  app.get("/admin/ping", (c) => c.json({ ok: true }));

  // Create a user (idempotent by email / portalUserId)
  const upsertUserSchema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    portalUserId: z.string().min(1),
    image: z.string().url().optional(),
  });
  app.post("/admin/users", async (c) => {
    const body = await jsonBody(await c.req.json(), upsertUserSchema);

    const byPortalId = await db.user.findUnique({
      where: { portalUserId: body.portalUserId },
    });
    if (byPortalId) {
      return c.json({ id: byPortalId.id, created: false });
    }

    const byEmail = await db.user.findUnique({ where: { email: body.email } });
    if (byEmail) {
      const linked = await db.user.update({
        where: { id: byEmail.id },
        data: {
          portalUserId: body.portalUserId,
          ...(body.name ? { name: body.name } : {}),
          ...(body.image ? { image: body.image } : {}),
        },
      });
      return c.json({ id: linked.id, created: false });
    }

    try {
      const created = await db.user.create({
        data: {
          email: body.email,
          name: body.name ?? null,
          image: body.image ?? null,
          portalUserId: body.portalUserId,
          isBetaUser: true,
        },
      });
      return c.json({ id: created.id, created: true });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        // Concurrent call won the race — look up what it created.
        const winner =
          (await db.user.findUnique({
            where: { portalUserId: body.portalUserId },
          })) ??
          (await db.user.findUnique({ where: { email: body.email } }));
        if (winner) {
          // Link to portal if missing
          if (!winner.portalUserId) {
            await db.user.update({
              where: { id: winner.id },
              data: { portalUserId: body.portalUserId },
            });
          }
          return c.json({ id: winner.id, created: false });
        }
      }
      throw err;
    }
  });

  // Lookup user by portalUserId
  app.get("/admin/users/by-portal-id/:portalUserId", async (c) => {
    const portalUserId = c.req.param("portalUserId");
    const user = await db.user.findUnique({
      where: { portalUserId },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        portalUserId: true,
        pricingPlanId: true,
        teamUsers: {
          select: { teamId: true, role: true },
        },
      },
    });
    if (!user) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "User not found" });
    }
    return c.json(user);
  });

  // Create a Team owned by the given user (idempotent: returns existing team if user already has one)
  const createTeamSchema = z.object({
    userId: z.number().int().positive(),
    name: z.string().min(1),
    pricingPlanKey: z.string().optional(),
    billingEmail: z.string().email().optional(),
  });
  app.post("/admin/teams", async (c) => {
    const body = await jsonBody(await c.req.json(), createTeamSchema);

    const user = await db.user.findUnique({ where: { id: body.userId } });
    if (!user) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "User not found" });
    }

    const existing = await db.team.findFirst({
      where: { teamUsers: { some: { userId: body.userId } } },
      include: { pricingPlan: true },
    });
    if (existing) {
      return c.json({ id: existing.id, created: false });
    }

    const plan = body.pricingPlanKey
      ? await db.pricingPlan.findUnique({ where: { key: body.pricingPlanKey } })
      : null;
    if (body.pricingPlanKey && !plan) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: `PricingPlan with key '${body.pricingPlanKey}' not found`,
      });
    }

    const team = await db.team.create({
      data: {
        name: body.name,
        billingEmail: body.billingEmail ?? user.email ?? null,
        pricingPlanId: plan?.id,
        plan: plan?.key === "free" || !plan ? "FREE" : "BASIC",
        teamUsers: {
          create: { userId: body.userId, role: "ADMIN" },
        },
      },
    });
    await TeamService.refreshTeamCache(team.id);
    await PlanService.invalidateTeam(team.id);
    return c.json({ id: team.id, created: true });
  });

  // Get team (includes plan + counts)
  app.get("/admin/teams/:teamId", async (c) => {
    const teamId = Number.parseInt(c.req.param("teamId"), 10);
    if (!Number.isFinite(teamId)) {
      throw new UnsendApiError({ code: "BAD_REQUEST", message: "Invalid teamId" });
    }
    const team = await db.team.findUnique({
      where: { id: teamId },
      include: {
        pricingPlan: true,
        _count: { select: { teamUsers: true, domains: true } },
      },
    });
    if (!team) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Team not found" });
    }
    return c.json(team);
  });

  // Assign plan to team
  const assignPlanSchema = z.object({
    pricingPlanKey: z.string().min(1),
  });
  app.patch("/admin/teams/:teamId/plan", async (c) => {
    const teamId = Number.parseInt(c.req.param("teamId"), 10);
    if (!Number.isFinite(teamId)) {
      throw new UnsendApiError({ code: "BAD_REQUEST", message: "Invalid teamId" });
    }
    const body = await jsonBody(await c.req.json(), assignPlanSchema);
    const plan = await db.pricingPlan.findUnique({
      where: { key: body.pricingPlanKey },
    });
    if (!plan) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: `PricingPlan with key '${body.pricingPlanKey}' not found`,
      });
    }
    const legacyPlan = plan.key === "free" ? "FREE" : "BASIC";
    await TeamService.updateTeam(teamId, {
      pricingPlan: { connect: { id: plan.id } },
      plan: legacyPlan,
      isActive: true,
    });
    await PlanService.invalidateTeam(teamId);
    return c.json({ ok: true });
  });

  // Block / unblock a team (used when subscription lapses)
  const blockSchema = z.object({ isBlocked: z.boolean() });
  app.patch("/admin/teams/:teamId/block", async (c) => {
    const teamId = Number.parseInt(c.req.param("teamId"), 10);
    if (!Number.isFinite(teamId)) {
      throw new UnsendApiError({ code: "BAD_REQUEST", message: "Invalid teamId" });
    }
    const body = await jsonBody(await c.req.json(), blockSchema);
    await TeamService.updateTeam(teamId, { isBlocked: body.isBlocked });
    return c.json({ ok: true });
  });

  // Current month usage for the team (proxy for portal dashboard)
  app.get("/admin/teams/:teamId/usage", async (c) => {
    const teamId = Number.parseInt(c.req.param("teamId"), 10);
    if (!Number.isFinite(teamId)) {
      throw new UnsendApiError({ code: "BAD_REQUEST", message: "Invalid teamId" });
    }
    const team = await db.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Team not found" });
    }
    const [usage, limits] = await Promise.all([
      getThisMonthUsage(teamId),
      PlanService.getLimitsForTeam(teamId),
    ]);
    return c.json({ teamId, usage, limits });
  });

  // Upsert a PricingPlan (source of truth is portal; mosend mirrors it)
  const upsertPlanSchema = z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    emailsPerMonth: z.number().int().default(-1),
    emailsPerDay: z.number().int().default(-1),
    maxDomains: z.number().int().default(-1),
    maxContactBooks: z.number().int().default(-1),
    maxTeamMembers: z.number().int().default(-1),
    maxWebhooks: z.number().int().default(-1),
    priceMonthly: z.number().nonnegative().default(0),
    currency: z.string().default("USD"),
    gatewayPriceIds: z.record(z.string(), z.string()).default({}),
    perks: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
    isEnterprise: z.boolean().default(false),
    isPopular: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  });
  app.put("/admin/plans/:key", async (c) => {
    const key = c.req.param("key");
    const body = await jsonBody(await c.req.json(), upsertPlanSchema);
    if (body.key !== key) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Key in path and body must match",
      });
    }

    const plan = await db.pricingPlan.upsert({
      where: { key },
      create: body,
      update: body,
    });

    // Invalidate caches for all teams on this plan so new limits take effect
    const affected = await db.team.findMany({
      where: { pricingPlanId: plan.id },
      select: { id: true },
    });
    await Promise.all(
      affected.map((t) => PlanService.invalidateTeam(t.id)),
    ).catch((err) =>
      logger.error({ err }, "Failed to invalidate team plan caches"),
    );
    return c.json({ id: plan.id, key: plan.key });
  });

  // Soft-delete a plan (isActive=false). Hard delete not allowed when teams depend on it.
  app.delete("/admin/plans/:key", async (c) => {
    const key = c.req.param("key");
    const plan = await db.pricingPlan.findUnique({ where: { key } });
    if (!plan) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: `PricingPlan with key '${key}' not found`,
      });
    }
    await db.pricingPlan.update({
      where: { key },
      data: { isActive: false },
    });
    return c.json({ ok: true });
  });

  return app;
}

export const adminApp = getAdminApp();
export default adminApp;
