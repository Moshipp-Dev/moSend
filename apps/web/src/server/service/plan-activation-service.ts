import { TRPCError } from "@trpc/server";
import type { PlanActivationRequest, PlanActivationStatus } from "@prisma/client";
import { db } from "~/server/db";
import { TeamService } from "./team-service";
import { PlanService } from "./plan-service";
import { logger } from "../logger/log";
import {
  sendPlanActivatedEmail,
  sendPlanExpiredEmail,
  sendPlanExpiringEmail,
  sendPlanRejectedEmail,
} from "~/server/mailer";

// Manual billing cycle: an approved activation is valid for this many days
// unless the admin chooses a different period (0 = no expiry).
export const DEFAULT_ACTIVATION_PERIOD_DAYS = 30;
export const REMINDER_DAYS_BEFORE_EXPIRY = 7;
export const FINAL_REMINDER_DAYS_BEFORE_EXPIRY = 1;
const FREE_PLAN_KEY = "free";

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// undefined → default period; null or <= 0 → no expiry.
function computeExpiresAt(from: Date, periodDays?: number | null): Date | null {
  const days =
    periodDays === undefined ? DEFAULT_ACTIVATION_PERIOD_DAYS : periodDays;
  if (!days || days <= 0) return null;
  return addDays(from, days);
}

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
  periodDays?: number | null;
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
  periodDays?: number | null;
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

    const now = new Date();
    const expiresAt = computeExpiresAt(now, input.periodDays);

    const updatedRequest = await db.$transaction(async (tx) => {
      if (req.targetUserId) {
        // Per-user plan assignment (new model).
        await tx.user.update({
          where: { id: req.targetUserId },
          data: { pricingPlan: { connect: { id: req.planId } } },
        });
      } else {
        // Team-level assignment (legacy: used when a team-wide plan is set).
        const legacyPlan = req.plan.key === FREE_PLAN_KEY ? "FREE" : "BASIC";
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

      await PlanActivationService.supersedeActiveRequests(
        tx,
        req.teamId,
        req.targetUserId,
        req.id,
        now,
      );

      return tx.planActivationRequest.update({
        where: { id: req.id },
        data: {
          status: "APPROVED",
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt: now,
          expiresAt,
          reminderSentAt: null,
          finalReminderSentAt: null,
          expiredAt: null,
          paymentReference: input.paymentReference ?? null,
          adminNotes: input.adminNotes ?? null,
        },
      });
    });

    await PlanActivationService.invalidateCaches(req.teamId, req.targetUserId);

    logger.info(
      {
        requestId: req.id,
        teamId: req.teamId,
        planId: req.planId,
        targetUserId: req.targetUserId,
        expiresAt,
      },
      "[PlanActivation] Request approved",
    );

    await PlanActivationService.notifyRecipients(
      req.teamId,
      req.targetUserId,
      (email) =>
        sendPlanActivatedEmail(email, { planName: req.plan.name, expiresAt }),
      { requestId: req.id, event: "approved" },
    );

    return updatedRequest;
  }

  // Admin-initiated activation: skips the PENDING state and assigns the plan
  // immediately. Useful when the admin confirmed payment out-of-band and the
  // user didn't go through /pricing first. Also the renewal path: approving a
  // new period for a user supersedes their previous active request.
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
    const expiresAt = computeExpiresAt(now, input.periodDays);

    const createdRequest = await db.$transaction(async (tx) => {
      if (input.targetUserId) {
        await tx.user.update({
          where: { id: input.targetUserId },
          data: { pricingPlan: { connect: { id: input.planId } } },
        });
      } else {
        const legacyPlan = plan.key === FREE_PLAN_KEY ? "FREE" : "BASIC";
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

      await PlanActivationService.supersedeActiveRequests(
        tx,
        input.teamId,
        input.targetUserId ?? null,
        null,
        now,
      );

      return tx.planActivationRequest.create({
        data: {
          teamId: input.teamId,
          planId: input.planId,
          requestedByUserId: input.adminUserId,
          targetUserId: input.targetUserId ?? null,
          reviewedByUserId: input.adminUserId,
          reviewedAt: now,
          expiresAt,
          status: "APPROVED",
          paymentMethod: input.paymentMethod ?? null,
          paymentReference: input.paymentReference ?? null,
          adminNotes: input.adminNotes ?? null,
        },
      });
    });

    await PlanActivationService.invalidateCaches(
      input.teamId,
      input.targetUserId ?? null,
    );

    logger.info(
      {
        requestId: createdRequest.id,
        teamId: input.teamId,
        planId: input.planId,
        targetUserId: input.targetUserId,
        adminUserId: input.adminUserId,
        expiresAt,
      },
      "[PlanActivation] Manual activation by admin",
    );

    await PlanActivationService.notifyRecipients(
      input.teamId,
      input.targetUserId ?? null,
      (email) => sendPlanActivatedEmail(email, { planName: plan.name, expiresAt }),
      { requestId: createdRequest.id, event: "manual-assign" },
    );

    return createdRequest;
  }

  static async reject(input: RejectInput): Promise<PlanActivationRequest> {
    const req = await db.planActivationRequest.findUnique({
      where: { id: input.requestId },
      include: { plan: true },
    });
    if (!req) throw new TRPCError({ code: "NOT_FOUND" });
    if (req.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `No se puede rechazar una solicitud en estado ${req.status}`,
      });
    }

    const updated = await db.planActivationRequest.update({
      where: { id: req.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: new Date(),
        rejectionReason: input.rejectionReason,
        adminNotes: input.adminNotes ?? null,
      },
    });

    await PlanActivationService.notifyRecipients(
      req.teamId,
      req.targetUserId,
      (email) =>
        sendPlanRejectedEmail(email, {
          planName: req.plan.name,
          reason: input.rejectionReason,
        }),
      { requestId: req.id, event: "rejected" },
    );

    return updated;
  }

  // Admin-initiated block/unblock of a CLIENT user. Blocked users keep their
  // plan but every send from their domains fails with EMAIL_BLOCKED.
  static async setUserBlocked(
    userId: number,
    blocked: boolean,
    reason?: string | null,
  ) {
    const user = await db.user.update({
      where: { id: userId },
      data: {
        isBlocked: blocked,
        blockedReason: blocked ? (reason ?? null) : null,
      },
      select: { id: true, email: true, isBlocked: true, blockedReason: true },
    });
    await PlanService.invalidateUser(userId);
    logger.info(
      { userId, blocked, reason },
      "[PlanActivation] User block state changed",
    );
    return user;
  }

  // Daily job entry points ---------------------------------------------------

  // Sends the 7-day and 1-day reminders for approved activations that are
  // about to expire. Idempotent: each reminder is recorded on the request.
  static async sendReminders(now = new Date()): Promise<{
    reminders: number;
    finalReminders: number;
  }> {
    const firstWindow = await db.planActivationRequest.findMany({
      where: {
        status: "APPROVED",
        reminderSentAt: null,
        expiresAt: {
          gt: now,
          lte: addDays(now, REMINDER_DAYS_BEFORE_EXPIRY),
        },
      },
      include: { plan: true },
    });

    for (const req of firstWindow) {
      await PlanActivationService.notifyRecipients(
        req.teamId,
        req.targetUserId,
        (email) =>
          sendPlanExpiringEmail(email, {
            planName: req.plan.name,
            expiresAt: req.expiresAt!,
            daysLeft: REMINDER_DAYS_BEFORE_EXPIRY,
          }),
        { requestId: req.id, event: "reminder" },
      );
      await db.planActivationRequest.update({
        where: { id: req.id },
        data: { reminderSentAt: now },
      });
    }

    const finalWindow = await db.planActivationRequest.findMany({
      where: {
        status: "APPROVED",
        finalReminderSentAt: null,
        expiresAt: {
          gt: now,
          lte: addDays(now, FINAL_REMINDER_DAYS_BEFORE_EXPIRY),
        },
      },
      include: { plan: true },
    });

    for (const req of finalWindow) {
      await PlanActivationService.notifyRecipients(
        req.teamId,
        req.targetUserId,
        (email) =>
          sendPlanExpiringEmail(email, {
            planName: req.plan.name,
            expiresAt: req.expiresAt!,
            daysLeft: FINAL_REMINDER_DAYS_BEFORE_EXPIRY,
          }),
        { requestId: req.id, event: "final-reminder" },
      );
      await db.planActivationRequest.update({
        where: { id: req.id },
        data: { finalReminderSentAt: now },
      });
    }

    return { reminders: firstWindow.length, finalReminders: finalWindow.length };
  }

  // Expires approved activations whose period ended: the target (user or
  // team) is downgraded to the free plan only if it still holds the plan that
  // this request granted, so a newer assignment is never overwritten.
  static async expireDue(now = new Date()): Promise<number> {
    const due = await db.planActivationRequest.findMany({
      where: { status: "APPROVED", expiresAt: { lte: now } },
      include: { plan: true },
    });
    if (due.length === 0) return 0;

    const freePlan = await db.pricingPlan.findFirst({
      where: { key: FREE_PLAN_KEY },
    });

    for (const req of due) {
      await db.$transaction(async (tx) => {
        if (req.targetUserId) {
          const user = await tx.user.findUnique({
            where: { id: req.targetUserId },
            select: { pricingPlanId: true },
          });
          if (user?.pricingPlanId === req.planId) {
            await tx.user.update({
              where: { id: req.targetUserId },
              data: { pricingPlanId: freePlan?.id ?? null },
            });
          }
        } else {
          const team = await tx.team.findUnique({
            where: { id: req.teamId },
            select: { pricingPlanId: true },
          });
          if (team?.pricingPlanId === req.planId) {
            await tx.team.update({
              where: { id: req.teamId },
              data: { pricingPlanId: freePlan?.id ?? null, plan: "FREE" },
            });
          }
        }

        await tx.planActivationRequest.update({
          where: { id: req.id },
          data: { status: "EXPIRED", expiredAt: now },
        });
      });

      await PlanActivationService.invalidateCaches(req.teamId, req.targetUserId);

      logger.info(
        {
          requestId: req.id,
          teamId: req.teamId,
          targetUserId: req.targetUserId,
          planId: req.planId,
        },
        "[PlanActivation] Activation expired, downgraded to free",
      );

      await PlanActivationService.notifyRecipients(
        req.teamId,
        req.targetUserId,
        (email) => sendPlanExpiredEmail(email, { planName: req.plan.name }),
        { requestId: req.id, event: "expired" },
      );
    }

    return due.length;
  }

  // Queries -----------------------------------------------------------------

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

  // Internals ---------------------------------------------------------------

  // A new approval for the same target replaces any previous active period.
  // The old request is closed as EXPIRED so the expiry job never downgrades
  // the target because of a stale row.
  private static async supersedeActiveRequests(
    tx: Pick<typeof db, "planActivationRequest">,
    teamId: number,
    targetUserId: number | null,
    keepRequestId: string | null,
    now: Date,
  ) {
    await tx.planActivationRequest.updateMany({
      where: {
        teamId,
        targetUserId,
        status: "APPROVED",
        ...(keepRequestId ? { id: { not: keepRequestId } } : {}),
      },
      data: { status: "EXPIRED", expiredAt: now },
    });
  }

  private static async invalidateCaches(
    teamId: number,
    targetUserId: number | null,
  ) {
    const invalidations: Promise<unknown>[] = [
      TeamService.refreshTeamCache(teamId),
      PlanService.invalidateTeam(teamId),
    ];
    if (targetUserId) {
      invalidations.push(PlanService.invalidateUser(targetUserId));
    }
    await Promise.all(invalidations);
  }

  // Per-user activations notify that user; team-level ones notify the billing
  // email, falling back to the team's ADMIN members.
  private static async resolveRecipients(
    teamId: number,
    targetUserId: number | null,
  ): Promise<string[]> {
    if (targetUserId) {
      const user = await db.user.findUnique({
        where: { id: targetUserId },
        select: { email: true },
      });
      return user?.email ? [user.email] : [];
    }

    const team = await db.team.findUnique({
      where: { id: teamId },
      select: {
        billingEmail: true,
        teamUsers: {
          where: { role: "ADMIN" },
          select: { user: { select: { email: true } } },
        },
      },
    });
    if (team?.billingEmail) return [team.billingEmail];
    return (team?.teamUsers ?? [])
      .map((tu) => tu.user.email)
      .filter((email): email is string => Boolean(email));
  }

  // Notification failures must never roll back a plan change, so every send
  // is isolated and only logged.
  private static async notifyRecipients(
    teamId: number,
    targetUserId: number | null,
    send: (_email: string) => Promise<void>,
    context: Record<string, unknown>,
  ) {
    try {
      const recipients = await PlanActivationService.resolveRecipients(
        teamId,
        targetUserId,
      );
      if (recipients.length === 0) {
        logger.warn(
          { teamId, targetUserId, ...context },
          "[PlanActivation] No recipient email for notification",
        );
        return;
      }
      for (const email of recipients) {
        await send(email);
      }
    } catch (err) {
      logger.error(
        { err, teamId, targetUserId, ...context },
        "[PlanActivation] Failed to send notification email",
      );
    }
  }
}
