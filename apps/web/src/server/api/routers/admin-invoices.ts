import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PlanInvoiceStatus } from "@prisma/client";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { InvoiceService } from "~/server/service/invoice-service";
import { PlanActivationService } from "~/server/service/plan-activation-service";

// Operator view of every cuenta de cobro and factura, with the actions that
// close the manual billing loop: register a payment, void, resend, download.
export const adminInvoicesRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z
        .object({
          status: z.nativeEnum(PlanInvoiceStatus).optional(),
          search: z.string().optional(),
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
        })
        .default({ page: 1, pageSize: 25 }),
    )
    .query(async ({ input }) => {
      return InvoiceService.listAll(input);
    }),

  pdf: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const rendered = await InvoiceService.renderPdfById(input.id);
      if (!rendered) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { filename: rendered.filename, base64: rendered.pdf.toString("base64") };
    }),

  registerPayment: adminProcedure
    .input(
      z.object({
        id: z.string(),
        paymentMethod: z.string().max(80).nullable().optional(),
        paymentReference: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return PlanActivationService.registerInvoicePayment({
        invoiceId: input.id,
        adminUserId: ctx.session.user.id,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
      });
    }),

  void: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await InvoiceService.void(input.id);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "No se pudo anular",
        });
      }
    }),

  resend: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await PlanActivationService.resendInvoice(input.id);
      return { ok: true };
    }),
});
