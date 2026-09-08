import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { InvoiceService } from "~/server/service/invoice-service";

// Customer-facing invoices: a CLIENT sees their own cuentas de cobro and
// facturas; ADMIN/MEMBER see the ones issued to their team (legacy) plus
// their own, which in practice is empty for the operator.
export const invoiceRouter = createTRPCRouter({
  listMine: teamProcedure.query(async ({ ctx }) => {
    const invoices = await InvoiceService.listForUser(ctx.session.user.id);
    return invoices.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      planName: i.planName,
      description: i.description,
      amount: Number(i.amount),
      currency: i.currency,
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      paidAt: i.paidAt,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
    }));
  }),

  pdf: teamProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await InvoiceService.getWithParties(input.id);
      if (
        !invoice ||
        invoice.teamId !== ctx.team.id ||
        (invoice.userId !== null && invoice.userId !== ctx.session.user.id)
      ) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return {
        filename: InvoiceService.fileName(invoice),
        base64: InvoiceService.renderPdf(invoice).toString("base64"),
      };
    }),
});
