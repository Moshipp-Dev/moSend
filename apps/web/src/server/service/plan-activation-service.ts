import { TRPCError } from "@trpc/server";
import type { PlanActivationRequest, PlanActivationStatus } from "@prisma/client";
import { db } from "~/server/db";
import { TeamService } from "./team-service";
import { PlanService } from "./plan-service";
import { logger } from "../logger/log";

export interface CreateRequestInput {
  teamId: number;
  planId: number;
  requestedByUserId: number;
  targetUserId?: number | null;
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
  targetUserId?: number | null;
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

    const targetUserId = input.targetUserId ?? input.requestedByUserId;

    // Prevent duplicate pending requests for the same (team, plan, targetUser)
    const existingPending = await db.planActivationRequest.findFirst({
      where: {
        teamId: input.teamId,
        planId: input.planId,
        targetUserId,
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
        targetUserId,
        paymentMethod: input.paymentMethod ?? null,
        userNotes: input.userNotes ?? null,
        status: "PENDING",
      },
    });

    logger.info(
      {
        requestId: request.id,
        teamId: input.teamId,
        planId: input.planId,
        targetUserId,
      },
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
      include: { plan: true },
    });
    if (!req) throw new TRPCError({ code: "NOT_FOUND" });
    if (req.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `No se puede aprobar una solicitud en estado ${req.status}`,
      });
    }

    const updatedRequest = await db.$transaction(async (tx) => {
      if (req.targetUserId) {
        // Per-user plan assignment (new model).
        await tx.user.update({
          where: { id: req.targetUserId },
          data: { pricingPlan: { connect: { id: req.planId } } },
        });
      } else {
        // Team-level assignment (legacy: used when a team-wide plan is set).
        const legacyPlan = req.plan.key === "free" ? "FREE" : "BASIC";
        await tx.team.update({
          where: { id: req.teamId },
          data: {
            pricingPlan: { connect: { id: req.planId } },
            plan: legacyPlan,
            isActive: true,
            isBlocked: false,
          },
        });
      }

      return tx.planActivationRequest.update({
        where: { id: req.id },
        data: {
          status: "APPROVED",
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt: new Date(),
          paymentReference: input.paymentReference ?? null,
          adminNotes: input.adminNotes ?? null,
        },
      });
    });

    const invalidations: Promise<unknown>[] = [
      TeamService.refreshTeamCache(req.teamId),
      PlanService.invalidateTeam(req.teamId),
    ];
    if (req.targetUserId) {
      invalidations.push(PlanService.invalidateUser(req.targetUserId));
    }
    await Promise.all(invalidations);

    logger.info(
      {
        requestId: req.id,
        teamId: req.teamId,
        planId: req.planId,
        targetUserId: req.targetUserId,
      },
      "[PlanActivation] Request approved",
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

    // If targeting a user, ensure the user belongs to the team.
    if (input.targetUserId) {
      const membership = await db.teamUser.findUnique({
        where: {
          teamId_userId: { teamId: input.teamId, userId: input.targetUserId },
        },
      });
      if (!membership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El usuario no pertenece al team seleccionado",
        });
      }
    }

    const now = new Date();

    const createdRequest = await db.$transaction(async (tx) => {
      if (input.targetUserId) {
        await tx.user.update({
          where: { id: input.targetUserId },
          data: { pricingPlan: { connect: { id: input.planId } } },
        });
      } else {
        const legacyPlan = plan.key === "free" ? "FREE" : "BASIC";
        await tx.team.update({
          where: { id: input.teamId },
          data: {
            pricingPlan: { connect: { id: input.planId } },
            plan: legacyPlan,
            isActive: true,
            isBlocked: false,
          },
        });
      }

      return tx.planActivationRequest.create({
        data: {
          teamId: input.teamId,
          planId: input.planId,
          requestedByUserId: input.adminUserId,
          targetUserId: input.targetUserId ?? null,
          reviewedByUserId: input.adminUserId,
          reviewedAt: now,
          status: "APPROVED",
          paymentMethod: input.paymentMethod ?? null,
          paymentReference: input.paymentReference ?? null,
          adminNotes: input.adminNotes ?? null,
        },
      });
    });

    const invalidations: Promise<unknown>[] = [
      TeamService.refreshTeamCache(input.teamId),
      PlanService.invalidateTeam(input.teamId),
    ];
    if (input.targetUserId) {
      invalidations.push(PlanService.invalidateUser(input.targetUserId));
    }
    await Promise.all(invalidations);

    logger.info(
      {
        requestId: createdRequest.id,
        teamId: input.teamId,
        planId: input.planId,
        targetUserId: input.targetUserId,
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

  static async listForUser(userId: number, limit = 20) {
    return db.planActivationRequest.findMany({
      where: { targetUserId: userId },
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
          targetUser: { select: { id: true, name: true, email: true } },
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
        targetUser: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
