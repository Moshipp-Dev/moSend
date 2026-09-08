import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { env } from "~/env";
import { logger } from "../logger/log";
import { PlanActivationService } from "./plan-activation-service";
import { sendClientWelcomeEmail } from "~/server/mailer";

export interface ListClientsInput {
  search?: string;
  planId?: number;
  blocked?: boolean;
  teamId?: number;
  page?: number;
  pageSize?: number;
}

export interface CreateClientInput {
  teamId: number;
  email: string;
  name?: string | null;
  domainIds?: number[];
  // Optional initial plan; when present the client is activated immediately.
  planId?: number | null;
  periodDays?: number | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  adminNotes?: string | null;
  adminUserId: number;
  sendWelcomeEmail?: boolean;
}

// Operator-side onboarding of a billable customer: a User with the CLIENT
// role in the operator's team, scoped to the domains they may send from,
// optionally activated on a plan right away. No invitation round-trip: the
// customer signs in later with the same email (magic link or OAuth).
export class ClientService {
  // Shared by the tRPC admin router and the external admin API.
  static async list(input: ListClientsInput) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const where = {
      role: "CLIENT" as const,
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      user: {
        ...(input.search
          ? {
              OR: [
                { email: { contains: input.search, mode: "insensitive" as const } },
                { name: { contains: input.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(input.planId !== undefined ? { pricingPlanId: input.planId } : {}),
        ...(input.blocked !== undefined ? { isBlocked: input.blocked } : {}),
      },
    };

    const [total, rows] = await Promise.all([
      db.teamUser.count({ where }),
      db.teamUser.findMany({
        where,
        include: {
          team: { select: { id: true, name: true } },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
              isBlocked: true,
              blockedReason: true,
              blockedBySystem: true,
              pricingPlan: { select: { id: true, key: true, name: true } },
              planInvoices: {
                orderBy: { issuedAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  number: true,
                  status: true,
                  amount: true,
                  currency: true,
                  dueAt: true,
                  paidAt: true,
                },
              },
              _count: { select: { clientDomainAccesses: true } },
              activationsReceived: {
                where: { status: "APPROVED" },
                orderBy: { reviewedAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  expiresAt: true,
                  reviewedAt: true,
                  plan: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { user: { email: "asc" } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const clients = rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      createdAt: r.user.createdAt,
      team: r.team,
      plan: r.user.pricingPlan,
      domainsCount: r.user._count.clientDomainAccesses,
      isBlocked: r.user.isBlocked,
      blockedReason: r.user.blockedReason,
      blockedBySystem: r.user.blockedBySystem,
      activeActivation: r.user.activationsReceived[0] ?? null,
      lastInvoice: r.user.planInvoices[0]
        ? { ...r.user.planInvoices[0], amount: Number(r.user.planInvoices[0].amount) }
        : null,
    }));

    return { total, clients, page, pageSize };
  }

  // Full picture of one client for the external API.
  static async get(userId: number) {
    const membership = await db.teamUser.findFirst({
      where: { userId, role: "CLIENT" },
      include: {
        team: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            isBlocked: true,
            blockedReason: true,
            blockedBySystem: true,
            pricingPlan: {
              select: {
                id: true,
                key: true,
                name: true,
                priceMonthly: true,
                currency: true,
                emailsPerMonth: true,
                emailsPerDay: true,
              },
            },
            clientDomainAccesses: {
              select: { domain: { select: { id: true, name: true, status: true } } },
            },
            activationsReceived: {
              orderBy: { createdAt: "desc" },
              take: 10,
              select: {
                id: true,
                status: true,
                expiresAt: true,
                reviewedAt: true,
                paymentMethod: true,
                paymentReference: true,
                plan: { select: { id: true, key: true, name: true } },
              },
            },
            planInvoices: {
              orderBy: { issuedAt: "desc" },
              take: 24,
              select: {
                id: true,
                number: true,
                status: true,
                amount: true,
                currency: true,
                description: true,
                issuedAt: true,
                dueAt: true,
                paidAt: true,
                paymentMethod: true,
                paymentReference: true,
              },
            },
          },
        },
      },
    });
    if (!membership) return null;
    const u = membership.user;
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      team: membership.team,
      plan: u.pricingPlan
        ? { ...u.pricingPlan, priceMonthly: Number(u.pricingPlan.priceMonthly) }
        : null,
      isBlocked: u.isBlocked,
      blockedReason: u.blockedReason,
      blockedBySystem: u.blockedBySystem,
      domains: u.clientDomainAccesses.map((a) => a.domain),
      activations: u.activationsReceived,
      invoices: u.planInvoices.map((i) => ({ ...i, amount: Number(i.amount) })),
    };
  }

  static async setDomains(
    userId: number,
    teamId: number,
    domainIds: number[],
    mode: "grant" | "revoke",
  ) {
    const membership = await db.teamUser.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!membership || membership.role !== "CLIENT") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado" });
    }
    const ids = Array.from(new Set(domainIds));
    const owned = await db.domain.count({ where: { id: { in: ids }, teamId } });
    if (owned !== ids.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Alguno de los dominios no pertenece al team",
      });
    }
    if (mode === "grant") {
      await db.clientDomainAccess.createMany({
        data: ids.map((domainId) => ({ userId, domainId, teamId })),
        skipDuplicates: true,
      });
    } else {
      await db.clientDomainAccess.deleteMany({
        where: { userId, teamId, domainId: { in: ids } },
      });
    }
    const accesses = await db.clientDomainAccess.findMany({
      where: { userId, teamId },
      select: { domain: { select: { id: true, name: true, status: true } } },
    });
    return accesses.map((a) => a.domain);
  }

  // Who acts on behalf of an API automation: the configured ADMIN_EMAIL user,
  // else a platform admin, else the first ADMIN of the team. Recorded as the
  // reviewer on activations so the audit trail stays complete.
  static async resolveActorId(teamId?: number): Promise<number> {
    if (env.ADMIN_EMAIL) {
      const byEmail = await db.user.findUnique({
        where: { email: env.ADMIN_EMAIL },
        select: { id: true },
      });
      if (byEmail) return byEmail.id;
    }
    const admin = await db.user.findFirst({
      where: { isAdmin: true },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (admin) return admin.id;
    const teamAdmin = await db.teamUser.findFirst({
      where: { role: "ADMIN", ...(teamId !== undefined ? { teamId } : {}) },
      orderBy: { userId: "asc" },
      select: { userId: true },
    });
    if (teamAdmin) return teamAdmin.userId;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No hay un usuario operador para registrar la acción",
    });
  }

  static async createClient(input: CreateClientInput) {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Email requerido" });
    }

    const team = await db.team.findUnique({ where: { id: input.teamId } });
    if (!team) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Team no encontrado" });
    }

    const domainIds = Array.from(new Set(input.domainIds ?? []));
    if (domainIds.length > 0) {
      const owned = await db.domain.count({
        where: { id: { in: domainIds }, teamId: input.teamId },
      });
      if (owned !== domainIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Alguno de los dominios no pertenece al team",
        });
      }
    }

    const existing = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { teamUsers: true },
    });

    let userId: number;
    let created = false;

    if (existing) {
      const membership = existing.teamUsers.find(
        (tu) => tu.teamId === input.teamId,
      );
      const elsewhere = existing.teamUsers.find(
        (tu) => tu.teamId !== input.teamId,
      );
      if (elsewhere) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ese email ya pertenece a otro team",
        });
      }
      if (membership && membership.role !== "CLIENT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Ese usuario ya es ${membership.role} del team, no puede convertirse en cliente desde acá`,
        });
      }
      userId = existing.id;
      if (!membership) {
        await db.teamUser.create({
          data: { teamId: input.teamId, userId, role: "CLIENT" },
        });
      }
      if (input.name && !existing.name) {
        await db.user.update({
          where: { id: userId },
          data: { name: input.name },
        });
      }
    } else {
      const user = await db.user.create({
        data: {
          email,
          name: input.name?.trim() || null,
          isBetaUser: true,
          teamUsers: {
            create: { teamId: input.teamId, role: "CLIENT" },
          },
        },
      });
      userId = user.id;
      created = true;
    }

    if (domainIds.length > 0) {
      await db.clientDomainAccess.createMany({
        data: domainIds.map((domainId) => ({
          userId,
          domainId,
          teamId: input.teamId,
        })),
        skipDuplicates: true,
      });
    }

    logger.info(
      { userId, email, teamId: input.teamId, created, domainIds },
      "[ClientService] Client onboarded by admin",
    );

    let activation = null;
    if (input.planId) {
      activation = await PlanActivationService.manualAssign({
        teamId: input.teamId,
        planId: input.planId,
        adminUserId: input.adminUserId,
        targetUserId: userId,
        periodDays: input.periodDays,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        adminNotes: input.adminNotes,
      });
    }

    if (input.sendWelcomeEmail !== false) {
      try {
        const domains = domainIds.length
          ? await db.domain.findMany({
              where: { id: { in: domainIds } },
              select: { name: true },
            })
          : [];
        await sendClientWelcomeEmail(email, {
          name: input.name ?? existing?.name ?? null,
          domains: domains.map((d) => d.name),
        });
      } catch (err) {
        logger.error(
          { err, userId, email },
          "[ClientService] Failed to send welcome email",
        );
      }
    }

    return { userId, email, created, activationId: activation?.id ?? null };
  }
}
