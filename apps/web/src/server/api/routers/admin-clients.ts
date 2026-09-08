import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { PlanActivationService } from "~/server/service/plan-activation-service";
import { ClientService } from "~/server/service/client-service";
import { InvoiceService } from "~/server/service/invoice-service";

// Operator view of every CLIENT user: the people the SaaS actually bills.
// Each row carries the user's individual plan, the activation that granted
// it (with its expiry) and the block state used to suspend non-payers.
export const adminClientsRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          planId: z.number().optional(),
          blocked: z.boolean().optional(),
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
        })
        .default({ page: 1, pageSize: 25 }),
    )
    .query(async ({ input }) => {
      const where = {
        role: "CLIENT" as const,
        user: {
          ...(input.search
            ? {
                OR: [
                  {
                    email: {
                      contains: input.search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    name: {
                      contains: input.search,
                      mode: "insensitive" as const,
                    },
                  },
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
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
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
          ? {
              ...r.user.planInvoices[0],
              amount: Number(r.user.planInvoices[0].amount),
            }
          : null,
      }));

      return { total, clients, page: input.page, pageSize: input.pageSize };
    }),

  // Domains of a team with the CLIENT (if any) that currently holds each one,
  // so the onboarding form can grant existing domains to a new customer.
  teamDomains: adminProcedure
    .input(z.object({ teamId: z.number() }))
    .query(async ({ input }) => {
      const domains = await db.domain.findMany({
        where: { teamId: input.teamId },
        select: {
          id: true,
          name: true,
          status: true,
          clientDomainAccesses: {
            select: { user: { select: { id: true, email: true } } },
          },
        },
        orderBy: { name: "asc" },
      });
      return domains.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        holders: d.clientDomainAccesses.map((a) => a.user),
      }));
    }),

  create: adminProcedure
    .input(
      z.object({
        teamId: z.number(),
        email: z.string().email(),
        name: z.string().max(120).nullable().optional(),
        domainIds: z.array(z.number()).max(50).optional(),
        planId: z.number().nullable().optional(),
        periodDays: z.number().int().min(0).max(3650).nullable().optional(),
        paymentMethod: z.string().max(80).nullable().optional(),
        paymentReference: z.string().max(200).nullable().optional(),
        adminNotes: z.string().max(1000).nullable().optional(),
        sendWelcomeEmail: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ClientService.createClient({
        ...input,
        adminUserId: ctx.session.user.id,
      });
    }),

  invoices: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const invoices = await InvoiceService.listForUser(input.userId, 50);
      return invoices.map((i) => ({ ...i, amount: Number(i.amount) }));
    }),

  invoicePdf: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const rendered = await InvoiceService.renderPdfById(input.id);
      if (!rendered) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { filename: rendered.filename, base64: rendered.pdf.toString("base64") };
    }),

  // Cuenta de cobro ahead of a sale or renewal; the client receives it by
  // email with the PDF and the operator registers the payment later from
  // Admin → Facturas.
  issueInvoice: adminProcedure
    .input(
      z.object({
        teamId: z.number(),
        userId: z.number(),
        planId: z.number(),
        periodDays: z.number().int().min(1).max(3650).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await PlanActivationService.issueInvoice({
        ...input,
        adminUserId: ctx.session.user.id,
      });
      return { id: invoice.id, number: invoice.number };
    }),

  setBlocked: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        blocked: z.boolean(),
        reason: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return PlanActivationService.setUserBlocked(
        input.userId,
        input.blocked,
        input.reason,
      );
    }),
});
