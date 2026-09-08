import { TRPCError } from "@trpc/server";
import type { PlanActivationRequest, PlanActivationStatus } from "@prisma/client";
import { db } from "~/server/db";
import { TeamService } from "./team-service";
import { PlanService } from "./plan-service";
import { logger } from "../logger/log";
import {
  sendInvoiceEmail,
  sendPlanActivatedEmail,
  sendPlanExpiredEmail,
  sendPlanExpiringEmail,
  sendPlanRejectedEmail,
  sendPlanSuspendedEmail,
} from "~/server/mailer";
import { InvoiceService, formatMoney } from "./invoice-service";
import type { PlanInvoice } from "@prisma/client";

// Manual billing cycle: an approved activation is valid for this many days
// unless the admin chooses a different period (0 = no expiry).
export const DEFAULT_ACTIVATION_PERIOD_DAYS = 30;
export const REMINDER_DAYS_BEFORE_EXPIRY = 7;
export const FINAL_REMINDER_DAYS_BEFORE_EXPIRY = 1;
const FREE_PLAN_KEY = "free";

function formatDateEs(date: Date) {
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

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
  // A payment for an already issued cuenta de cobro is honoured even if the
  // plan was retired from the catalogue in the meantime.
  allowInactivePlan?: boolean;
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
    const periodStart = await PlanActivationService.nextPeriodStart(
      req.teamId,
      req.targetUserId,
      req.planId,
      now,
    );
    const expiresAt = computeExpiresAt(periodStart, input.periodDays);

    const updatedRequest = await db.$transaction(async (tx) => {
      if (req.targetUserId) {
        // Per-user plan assignment (new model). A payment also lifts a
        // suspension that the expiry job applied.
        await tx.user.update({
          where: { id: req.targetUserId },
          data: {
            pricingPlan: { connect: { id: req.planId } },
            ...(await PlanActivationService.systemUnblockData(tx, req.targetUserId)),
          },
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

    const invoice = await PlanActivationService.settleInvoice({
      teamId: req.teamId,
      userId: req.targetUserId,
      requestId: req.id,
      plan: req.plan,
      periodStart,
      periodEnd: expiresAt ?? addDays(periodStart, DEFAULT_ACTIVATION_PERIOD_DAYS),
      paymentMethod: req.paymentMethod,
      paymentReference: input.paymentReference,
      paidAt: now,
    });

    const invoiceInfo = await PlanActivationService.invoiceAttachment(invoice, true);
    await PlanActivationService.notifyRecipients(
      req.teamId,
      req.targetUserId,
      (email) =>
        sendPlanActivatedEmail(email, {
          planName: req.plan.name,
          expiresAt,
          periodStart,
          invoice: invoiceInfo,
        }),
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
    if (!plan.isActive && !input.allowInactivePlan) {
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
    const periodStart = await PlanActivationService.nextPeriodStart(
      input.teamId,
      input.targetUserId ?? null,
      input.planId,
      now,
    );
    const expiresAt = computeExpiresAt(periodStart, input.periodDays);

    const createdRequest = await db.$transaction(async (tx) => {
      if (input.targetUserId) {
        await tx.user.update({
          where: { id: input.targetUserId },
          data: {
            pricingPlan: { connect: { id: input.planId } },
            ...(await PlanActivationService.systemUnblockData(tx, input.targetUserId)),
          },
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

    const invoice = await PlanActivationService.settleInvoice({
      teamId: input.teamId,
      userId: input.targetUserId ?? null,
      requestId: createdRequest.id,
      plan,
      periodStart,
      periodEnd: expiresAt ?? addDays(periodStart, DEFAULT_ACTIVATION_PERIOD_DAYS),
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      paidAt: now,
    });

    const invoiceInfo = await PlanActivationService.invoiceAttachment(invoice, true);
    await PlanActivationService.notifyRecipients(
      input.teamId,
      input.targetUserId ?? null,
      (email) =>
        sendPlanActivatedEmail(email, {
          planName: plan.name,
          expiresAt,
          periodStart,
          invoice: invoiceInfo,
        }),
      { requestId: createdRequest.id, event: "manual-assign" },
    );

    return createdRequest;
  }

  // Operator marks a pending cuenta de cobro as paid: the plan of the invoice
  // is (re)activated for the invoiced period and the client gets the factura.
  static async registerInvoicePayment(input: {
    invoiceId: string;
    adminUserId: number;
    paymentMethod?: string | null;
    paymentReference?: string | null;
  }): Promise<PlanActivationRequest> {
    const invoice = await InvoiceService.getById(input.invoiceId);
    if (!invoice) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Factura no encontrada" });
    }
    if (invoice.status !== "ISSUED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Solo se puede registrar el pago de una cuenta de cobro pendiente",
      });
    }
    if (!invoice.userId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "La cuenta de cobro no está asociada a un cliente",
      });
    }
    const periodDays = Math.max(
      1,
      Math.round(
        (invoice.periodEnd.getTime() - invoice.periodStart.getTime()) / 86_400_000,
      ),
    );
    return PlanActivationService.manualAssign({
      teamId: invoice.teamId,
      planId: invoice.planId,
      adminUserId: input.adminUserId,
      targetUserId: invoice.userId,
      periodDays,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      adminNotes: `Pago de ${invoice.number}`,
      allowInactivePlan: true,
    });
  }

  // Operator issues a cuenta de cobro ahead of a sale or renewal. The period
  // starts when the current one ends, so paying early never shortens it.
  static async issueInvoice(input: {
    teamId: number;
    userId: number;
    planId: number;
    periodDays?: number | null;
    adminUserId: number;
  }): Promise<PlanInvoice> {
    const plan = await db.pricingPlan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Plan no encontrado" });
    }
    const planInfo = {
      id: plan.id,
      name: plan.name,
      priceMonthly: plan.priceMonthly as unknown as number,
      currency: plan.currency,
    };
    if (!InvoiceService.isBillable(planInfo)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Este plan no tiene precio; no genera cuenta de cobro",
      });
    }
    const membership = await db.teamUser.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    });
    if (!membership) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El usuario no pertenece al team seleccionado",
      });
    }
    const days =
      input.periodDays === undefined || input.periodDays === null || input.periodDays <= 0
        ? DEFAULT_ACTIVATION_PERIOD_DAYS
        : input.periodDays;
    const now = new Date();
    const periodStart = await PlanActivationService.nextPeriodStart(
      input.teamId,
      input.userId,
      input.planId,
      now,
    );
    const invoice = await InvoiceService.createPending({
      teamId: input.teamId,
      userId: input.userId,
      activationRequestId: null,
      plan: planInfo,
      periodStart,
      periodEnd: addDays(periodStart, days),
      dueAt: periodStart,
    });

    logger.info(
      { invoiceId: invoice.id, number: invoice.number, userId: input.userId, adminUserId: input.adminUserId },
      "[PlanActivation] Cuenta de cobro issued by admin",
    );

    await PlanActivationService.sendInvoice(invoice);
    return invoice;
  }

  static async resendInvoice(invoiceId: string): Promise<void> {
    const invoice = await InvoiceService.getById(invoiceId);
    if (!invoice) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Factura no encontrada" });
    }
    if (invoice.status === "VOID") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "La factura está anulada" });
    }
    await PlanActivationService.sendInvoice(invoice);
  }

  private static async sendInvoice(invoice: PlanInvoice) {
    const info = await PlanActivationService.invoiceAttachment(invoice, true);
    if (!info) return;
    await PlanActivationService.notifyRecipients(
      invoice.teamId,
      invoice.userId,
      (email) =>
        sendInvoiceEmail(email, {
          kind: invoice.status === "PAID" ? "paid" : "pending",
          number: invoice.number,
          planName: invoice.planName,
          amountLabel: info.amountLabel,
          dueAt: invoice.dueAt,
          attachment: info.attachment,
        }),
      { invoiceId: invoice.id, event: "invoice" },
    );
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
        blockedBySystem: false,
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
      const invoice = await PlanActivationService.pendingInvoiceFor(req);
      const invoiceInfo = await PlanActivationService.invoiceAttachment(invoice, true);
      await PlanActivationService.notifyRecipients(
        req.teamId,
        req.targetUserId,
        (email) =>
          sendPlanExpiringEmail(email, {
            planName: req.plan.name,
            expiresAt: req.expiresAt!,
            daysLeft: REMINDER_DAYS_BEFORE_EXPIRY,
            invoice: invoiceInfo,
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
      const invoice = await PlanActivationService.pendingInvoiceFor(req);
      const invoiceInfo = await PlanActivationService.invoiceAttachment(invoice, true);
      await PlanActivationService.notifyRecipients(
        req.teamId,
        req.targetUserId,
        (email) =>
          sendPlanExpiringEmail(email, {
            planName: req.plan.name,
            expiresAt: req.expiresAt!,
            daysLeft: FINAL_REMINDER_DAYS_BEFORE_EXPIRY,
            invoice: invoiceInfo,
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

  // Expires approved activations whose period ended. A CLIENT keeps their
  // plan but is suspended (sends blocked) with the reason on record, so a
  // registered payment simply reactivates them. Team-level (legacy)
  // activations fall back to the free plan when the team still holds the
  // plan that this request granted.
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
      const openInvoice = req.targetUserId
        ? await InvoiceService.findOpenForUser(req.targetUserId)
        : null;
      const suspensionReason = `Plan ${req.plan.name} vencido el ${formatDateEs(req.expiresAt ?? now)}. Pago pendiente${openInvoice ? ` de la cuenta de cobro ${openInvoice.number}` : ""}.`;

      await db.$transaction(async (tx) => {
        if (req.targetUserId) {
          await tx.user.update({
            where: { id: req.targetUserId },
            data: {
              isBlocked: true,
              blockedBySystem: true,
              blockedReason: suspensionReason,
            },
          });
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
          suspended: Boolean(req.targetUserId),
        },
        "[PlanActivation] Activation expired",
      );

      const invoiceInfo = await PlanActivationService.invoiceAttachment(openInvoice, true);
      await PlanActivationService.notifyRecipients(
        req.teamId,
        req.targetUserId,
        (email) =>
          req.targetUserId
            ? sendPlanSuspendedEmail(email, {
                planName: req.plan.name,
                expiredAt: req.expiresAt ?? now,
                invoice: invoiceInfo,
              })
            : sendPlanExpiredEmail(email, { planName: req.plan.name }),
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

  // A renewal of the same plan starts when the current period ends, so a
  // client who pays early keeps every day already paid for. Any other case
  // starts now.
  private static async nextPeriodStart(
    teamId: number,
    targetUserId: number | null,
    planId: number,
    now: Date,
  ): Promise<Date> {
    const current = await db.planActivationRequest.findFirst({
      where: {
        teamId,
        targetUserId,
        planId,
        status: "APPROVED",
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
      select: { expiresAt: true },
    });
    return current?.expiresAt ?? now;
  }

  // Extra user fields to write when a payment lifts an automatic suspension.
  // Manual blocks (blockedBySystem = false) are left untouched.
  private static async systemUnblockData(
    tx: Pick<typeof db, "user">,
    userId: number,
  ): Promise<{ isBlocked?: boolean; blockedReason?: null; blockedBySystem?: boolean }> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { isBlocked: true, blockedBySystem: true },
    });
    if (user?.isBlocked && user.blockedBySystem) {
      return { isBlocked: false, blockedReason: null, blockedBySystem: false };
    }
    return {};
  }

  // Records the payment as a PAID invoice for per-user, billable plans.
  private static async settleInvoice(input: {
    teamId: number;
    userId: number | null;
    requestId: string;
    plan: { id: number; name: string; priceMonthly: unknown; currency: string };
    periodStart: Date;
    periodEnd: Date;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    paidAt: Date;
  }): Promise<PlanInvoice | null> {
    if (!input.userId) return null;
    const plan = {
      id: input.plan.id,
      name: input.plan.name,
      priceMonthly: input.plan.priceMonthly as number,
      currency: input.plan.currency,
    };
    try {
      await InvoiceService.voidOpenForUser(input.userId, plan.id);
      if (!InvoiceService.isBillable(plan)) return null;
      return await InvoiceService.recordPayment({
        teamId: input.teamId,
        userId: input.userId,
        activationRequestId: input.requestId,
        plan,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        paidAt: input.paidAt,
      });
    } catch (err) {
      logger.error(
        { err, requestId: input.requestId, userId: input.userId },
        "[PlanActivation] Failed to record invoice",
      );
      return null;
    }
  }

  // Cuenta de cobro for the period that follows an approved activation.
  private static async pendingInvoiceFor(req: {
    id: string;
    teamId: number;
    targetUserId: number | null;
    reviewedAt: Date | null;
    expiresAt: Date | null;
    plan: { id: number; name: string; priceMonthly: unknown; currency: string };
  }): Promise<PlanInvoice | null> {
    if (!req.targetUserId || !req.expiresAt) return null;
    const plan = {
      id: req.plan.id,
      name: req.plan.name,
      priceMonthly: req.plan.priceMonthly as number,
      currency: req.plan.currency,
    };
    if (!InvoiceService.isBillable(plan)) return null;
    const periodDays = req.reviewedAt
      ? Math.max(
          1,
          Math.round(
            (req.expiresAt.getTime() - req.reviewedAt.getTime()) / 86_400_000,
          ),
        )
      : DEFAULT_ACTIVATION_PERIOD_DAYS;
    try {
      return await InvoiceService.createPending({
        teamId: req.teamId,
        userId: req.targetUserId,
        activationRequestId: req.id,
        plan,
        periodStart: req.expiresAt,
        periodEnd: addDays(req.expiresAt, periodDays),
        dueAt: req.expiresAt,
      });
    } catch (err) {
      logger.error(
        { err, requestId: req.id },
        "[PlanActivation] Failed to create pending invoice",
      );
      return null;
    }
  }

  // PDF + labels for an email attachment; never throws.
  private static async invoiceAttachment(
    invoice: PlanInvoice | null,
    withAmount = false,
  ) {
    if (!invoice) return null;
    try {
      const rendered = await InvoiceService.renderPdfById(invoice.id);
      if (!rendered) return null;
      return {
        number: invoice.number,
        amountLabel: withAmount
          ? formatMoney(Number(invoice.amount), invoice.currency)
          : "",
        attachment: rendered,
      };
    } catch (err) {
      logger.error(
        { err, invoiceId: invoice.id },
        "[PlanActivation] Failed to render invoice PDF",
      );
      return null;
    }
  }

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
    // eslint-disable-next-line no-unused-vars
    send: (email: string) => Promise<void>,
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
