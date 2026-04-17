import { TRPCError } from "@trpc/server";
import type { PlanActivationRequest, PlanActivationStatus, Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { TeamService } from "./team-service";
import { PlanService } from "./plan-service";
import { logger } from "../logger/log";

// Post-activation: downgrade every ADMIN of the team to CLIENT and grant
// ClientDomainAccess on all existing domains so they don't lose visibility.
// The SaaS admin keeps full control via adminProcedure; the team's former
// admins operate as CLIENT-scoped users. Idempotent.
async function downgradeAdminsToClients(
  tx: Prisma.TransactionClient,
  teamId: number,
) {
  const admins = await tx.teamUser.findMany({
    where: { teamId, role: "ADMIN" },
    select: { userId: true },
  });
  if (admins.length === 0) return;

  const domains = await tx.domain.findMany({
    where: { teamId },
    select: { id: true },
  });

  for (const { userId } of admins) {
    await tx.teamUser.update({
      where: { teamId_userId: { teamId, userId } },
      data: { role: "CLIENT" },
    });

    for (const domain of domains) {
      await tx.clientDomainAccess.upsert({
        where: { userId_domainId: { userId, domainId: domain.id } },
        create: { userId, domainId: domain.id, teamId },
        update: {},
      });
    }
  }

  logger.info(
    { teamId, downgraded: admins.length, domainsGranted: domains.length },
    "[PlanActivation] Downgraded admins to CLIENT role and granted domain access",
  );
}

export interface CreateRequestInput {
  teamId: number;
  planId: number;
  requestedByUserId: number;
  paymentMethod?: string | null;
  userNotes?: string | null;
}

export interface ApproveInput {
  requestId: string;
  reviewedByUserId: number;
  paymentReference?: string | null;
  adminNotes?: string | null;
}

export interface RejectInput {
  requestId: string;
  reviewedByUserId: number;
  rejectionReason: string;
  adminNotes?: string | null;
}

export interface ManualAssignInput {
  teamId: number;
  planId: number;
  adminUserId: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  adminNotes?: string | null;
}

export class PlanActivationService {
  static async createRequest(input: CreateRequestInput): Promise<PlanActivationRequest> {
    const plan = await db.pricingPlan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Plan no encontrado" });
    }
    if (!plan.isActive) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Este plan no está disponible actualmente",
      });
    }
    if (plan.isEnterprise) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Los planes empresariales requieren contacto con ventas",
      });
    }

    const team = await db.team.findUnique({ where: { id: input.teamId } });
    if (!team) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Team no encontrado" });
    }

    // Prevent duplicate pending requests for the same team+plan
    const existingPending = await db.planActivationRequest.findFirst({
      where: {
        teamId: input.teamId,
        planId: input.planId,
        status: "PENDING",
      },
    });
    if (existingPending) {
      return existingPending;
    }

    const request = await db.planActivationRequest.create({
      data: {
        teamId: input.teamId,
        planId: input.planId,
        requestedByUserId: input.requestedByUserId,
        paymentMethod: input.paymentMethod ?? null,
        userNotes: input.userNotes ?? null,
        status: "PENDING",
      },
    });

    logger.info(
      { requestId: request.id, teamId: input.teamId, planId: input.planId },
      "[PlanActivation] Request created",
    );

    return request;
  }

  static async cancelOwn(
    requestId: string,
    teamId: number,
    userId: number,
  ): Promise<void> {
    const req = await db.planActivationRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new TRPCError({ code: "NOT_FOUND" });
    if (req.teamId !== teamId) throw new TRPCError({ code: "FORBIDDEN" });
    if (req.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Solo solicitudes pendientes pueden cancelarse",
      });
    }

    await db.planActivationRequest.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        reviewedByUserId: userId,
        reviewedAt: new Date(),
      },
    });
  }

  static async approve(input: ApproveInput): Promise<PlanActivationRequest> {
    const req = await db.planActivationRequest.findUnique({
      where: { id: input.requestId },
      include: { plan: true, team: true },
    });
    if (!req) throw new TRPCError({ code: "NOT_FOUND" });
    if (req.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `No se puede aprobar una solicitud en estado ${req.status}`,
      });
    }

    const legacyPlan = req.plan.key === "free" ? "FREE" : "BASIC";

    // Atomic: mark approved + assign plan to team + demote admins to CLIENT
    const updatedRequest = await db.$transaction(async (tx) => {
      await tx.team.update({
        where: { id: req.teamId },
        data: {
          pricingPlan: { connect: { id: req.planId } },
          plan: legacyPlan,
          isActive: true,
          isBlocked: false,
        },
      });
      const updated = await tx.planActivationRequest.update({
        where: { id: req.id },
        data: {
          status: "APPROVED",
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt: new Date(),
          paymentReference: input.paymentReference ?? null,
          adminNotes: input.adminNotes ?? null,
        },
      });
      await downgradeAdminsToClients(tx, req.teamId);
      return updated;
    });

    await Promise.all([
      TeamService.refreshTeamCache(req.teamId),
      PlanService.invalidateTeam(req.teamId),
    ]);

    logger.info(
      { requestId: req.id, teamId: req.teamId, planId: req.planId },
      "[PlanActivation] Request approved, plan assigned",
    );

    return updatedRequest;
  }

  // Admin-initiated activation: skips the PENDING state and assigns the plan
  // immediately. Useful when the admin confirmed payment out-of-band and the
  // user didn't go through /pricing first.
  static async manualAssign(
    input: ManualAssignInput,
  ): Promise<PlanActivationRequest> {
    const plan = await db.pricingPlan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Plan no encontrado" });
    }
    if (!plan.isActive) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Este plan no está disponible actualmente",
      });
    }

    const team = await db.team.findUnique({ where: { id: input.teamId } });
    if (!team) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Team no encontrado" });
    }

    const legacyPlan = plan.key === "free" ? "FREE" : "BASIC";
    const now = new Date();

    const createdRequest = await db.$transaction(async (tx) => {
      await tx.team.update({
        where: { id: input.teamId },
        data: {
          pricingPlan: { connect: { id: input.planId } },
          plan: legacyPlan,
          isActive: true,
          isBlocked: false,
        },
      });
      const created = await tx.planActivationRequest.create({
        data: {
          teamId: input.teamId,
          planId: input.planId,
          requestedByUserId: input.adminUserId,
          reviewedByUserId: input.adminUserId,
          reviewedAt: now,
          status: "APPROVED",
          paymentMethod: input.paymentMethod ?? null,
          paymentReference: input.paymentReference ?? null,
          adminNotes: input.adminNotes ?? null,
        },
      });
      await downgradeAdminsToClients(tx, input.teamId);
      return created;
    });

    await Promise.all([
      TeamService.refreshTeamCache(input.teamId),
      PlanService.invalidateTeam(input.teamId),
    ]);

    logger.info(
      {
        requestId: createdRequest.id,
        teamId: input.teamId,
        planId: input.planId,
        adminUserId: input.adminUserId,
      },
      "[PlanActivation] Manual activation by admin",
    );

    return createdRequest;
  }

  static async reject(input: RejectInput): Promise<PlanActivationRequest> {
    const req = await db.planActivationRequest.findUnique({ where: { id: input.requestId } });
    if (!req) throw new TRPCError({ code: "NOT_FOUND" });
    if (req.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `No se puede rechazar una solicitud en estado ${req.status}`,
      });
    }

    return db.planActivationRequest.update({
      where: { id: req.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: new Date(),
        rejectionReason: input.rejectionReason,
        adminNotes: input.adminNotes ?? null,
      },
    });
  }

  static async listForTeam(teamId: number, limit = 20) {
    return db.planActivationRequest.findMany({
      where: { teamId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async listForAdmin(opts: {
    status?: PlanActivationStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 25;
    const where = opts.status ? { status: opts.status } : {};

    const [total, requests] = await Promise.all([
      db.planActivationRequest.count({ where }),
      db.planActivationRequest.findMany({
        where,
        include: {
          plan: true,
          team: { select: { id: true, name: true, billingEmail: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, requests, page, pageSize };
  }

  static async getById(id: string) {
    return db.planActivationRequest.findUnique({
      where: { id },
      include: {
        plan: true,
        team: { select: { id: true, name: true, billingEmail: true } },
      },
    });
  }
}
