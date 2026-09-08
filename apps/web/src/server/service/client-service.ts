import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { logger } from "../logger/log";
import { PlanActivationService } from "./plan-activation-service";
import { sendClientWelcomeEmail } from "~/server/mailer";

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
