import { Prisma } from "@prisma/client";
import type { PlanInvoice } from "@prisma/client";
import { db } from "~/server/db";
import { env } from "~/env";
import { logger } from "../logger/log";
import { renderSimplePdf, PDF_PAGE } from "../utils/simple-pdf";

const NUMBER_PREFIX = "MS";

export interface InvoicePlanInfo {
  id: number;
  name: string;
  priceMonthly: Prisma.Decimal | number | string;
  currency: string;
}

export interface CreatePendingInvoiceInput {
  teamId: number;
  userId: number;
  activationRequestId?: string | null;
  plan: InvoicePlanInfo;
  periodStart: Date;
  periodEnd: Date;
  dueAt: Date;
}

export interface RecordPaymentInput {
  teamId: number;
  userId: number;
  activationRequestId: string;
  plan: InvoicePlanInfo;
  periodStart: Date;
  periodEnd: Date;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paidAt: Date;
}

export type InvoiceWithParties = PlanInvoice & {
  team: { name: string; billingEmail: string | null };
  user: { name: string | null; email: string | null } | null;
};

function formatDate(date: Date) {
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// Cuentas de cobro and facturas for CLIENT plan periods. Free plans never
// produce invoices; everything here is a no-op for them.
export class InvoiceService {
  static isBillable(plan: InvoicePlanInfo): boolean {
    return Number(plan.priceMonthly) > 0;
  }

  static describePeriod(plan: InvoicePlanInfo, start: Date, end: Date) {
    return `Plan ${plan.name} · ${formatDate(start)} a ${formatDate(end)}`;
  }

  static async findOpenForUser(userId: number): Promise<PlanInvoice | null> {
    return db.planInvoice.findFirst({
      where: { userId, status: "ISSUED" },
      orderBy: { issuedAt: "desc" },
    });
  }

  // Pending payment notice for the upcoming period. Reuses an open invoice
  // for the same activation so reminders never duplicate it.
  static async createPending(input: CreatePendingInvoiceInput): Promise<PlanInvoice> {
    if (input.activationRequestId) {
      const existing = await db.planInvoice.findFirst({
        where: {
          activationRequestId: input.activationRequestId,
          status: "ISSUED",
        },
      });
      if (existing) return existing;
    }

    return InvoiceService.createWithNumber({
      teamId: input.teamId,
      userId: input.userId,
      activationRequestId: input.activationRequestId ?? null,
      planId: input.plan.id,
      planName: input.plan.name,
      description: InvoiceService.describePeriod(
        input.plan,
        input.periodStart,
        input.periodEnd,
      ),
      amount: new Prisma.Decimal(Number(input.plan.priceMonthly)),
      currency: input.plan.currency,
      status: "ISSUED",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueAt: input.dueAt,
    });
  }

  // Called when the operator records a payment (approve / renew). Settles the
  // open cuenta de cobro of that client if there is one, otherwise issues a
  // paid invoice for the new period.
  static async recordPayment(input: RecordPaymentInput): Promise<PlanInvoice> {
    const open = await db.planInvoice.findFirst({
      where: { userId: input.userId, status: "ISSUED", planId: input.plan.id },
      orderBy: { issuedAt: "desc" },
    });

    if (open) {
      return db.planInvoice.update({
        where: { id: open.id },
        data: {
          status: "PAID",
          paidAt: input.paidAt,
          paymentMethod: input.paymentMethod ?? null,
          paymentReference: input.paymentReference ?? null,
          activationRequestId: input.activationRequestId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          description: InvoiceService.describePeriod(
            input.plan,
            input.periodStart,
            input.periodEnd,
          ),
        },
      });
    }

    return InvoiceService.createWithNumber({
      teamId: input.teamId,
      userId: input.userId,
      activationRequestId: input.activationRequestId,
      planId: input.plan.id,
      planName: input.plan.name,
      description: InvoiceService.describePeriod(
        input.plan,
        input.periodStart,
        input.periodEnd,
      ),
      amount: new Prisma.Decimal(Number(input.plan.priceMonthly)),
      currency: input.plan.currency,
      status: "PAID",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueAt: null,
      paidAt: input.paidAt,
      paymentMethod: input.paymentMethod ?? null,
      paymentReference: input.paymentReference ?? null,
    });
  }

  // Open invoices of a user whose plan changed are voided so they are never
  // paid against the wrong plan.
  static async voidOpenForUser(userId: number, exceptPlanId?: number) {
    await db.planInvoice.updateMany({
      where: {
        userId,
        status: "ISSUED",
        ...(exceptPlanId ? { planId: { not: exceptPlanId } } : {}),
      },
      data: { status: "VOID" },
    });
  }

  static async listForUser(userId: number, limit = 24) {
    return db.planInvoice.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
      take: limit,
    });
  }

  static async getWithParties(id: string): Promise<InvoiceWithParties | null> {
    return db.planInvoice.findUnique({
      where: { id },
      include: {
        team: { select: { name: true, billingEmail: true } },
        user: { select: { name: true, email: true } },
      },
    });
  }

  static fileName(invoice: PlanInvoice) {
    const kind = invoice.status === "PAID" ? "factura" : "cuenta-de-cobro";
    return `${kind}-${invoice.number}.pdf`;
  }

  static renderPdf(invoice: InvoiceWithParties): Buffer {
    const isPaid = invoice.status === "PAID";
    const title = isPaid ? "FACTURA / RECIBO DE PAGO" : "CUENTA DE COBRO";
    const issuerName = env.INVOICE_ISSUER_NAME ?? invoice.team.name;
    const issuerDetails = (env.INVOICE_ISSUER_DETAILS ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const amount = Number(invoice.amount);
    const left = 56;
    const right = PDF_PAGE.width - 56;
    let y = PDF_PAGE.height - 64;

    const lines: { text: string; x: number; y: number; size?: number; bold?: boolean }[] = [];
    const rules: { x1: number; x2: number; y: number }[] = [];
    const put = (text: string, x: number, opts: { size?: number; bold?: boolean } = {}) => {
      lines.push({ text, x, y, ...opts });
    };
    const nl = (step = 16) => {
      y -= step;
    };

    put(issuerName, left, { size: 18, bold: true });
    put(title, right - 230, { size: 13, bold: true });
    nl(18);
    for (const detail of issuerDetails) {
      put(detail, left, { size: 9 });
      nl(12);
    }
    nl(8);
    rules.push({ x1: left, x2: right, y });
    nl(20);

    put("Número:", left, { bold: true });
    put(invoice.number, left + 90);
    put("Fecha de emisión:", left + 280, { bold: true });
    put(formatDate(invoice.issuedAt), left + 400);
    nl();
    put("Estado:", left, { bold: true });
    put(isPaid ? "PAGADA" : "PENDIENTE DE PAGO", left + 90, { bold: true });
    if (isPaid && invoice.paidAt) {
      put("Fecha de pago:", left + 280, { bold: true });
      put(formatDate(invoice.paidAt), left + 400);
    } else if (invoice.dueAt) {
      put("Vence:", left + 280, { bold: true });
      put(formatDate(invoice.dueAt), left + 400);
    }
    nl(26);

    put("Cliente", left, { bold: true, size: 12 });
    nl();
    put(invoice.user?.name ?? invoice.team.name, left);
    nl(14);
    put(invoice.user?.email ?? invoice.team.billingEmail ?? "", left, { size: 10 });
    nl(28);

    rules.push({ x1: left, x2: right, y: y + 6 });
    put("Concepto", left, { bold: true });
    put("Período", left + 260, { bold: true });
    put("Valor", right - 90, { bold: true });
    nl(8);
    rules.push({ x1: left, x2: right, y });
    nl(18);
    put(`Plan ${invoice.planName} (paquete mensual)`, left);
    put(
      `${formatDate(invoice.periodStart)} a ${formatDate(invoice.periodEnd)}`,
      left + 260,
    );
    put(formatMoney(amount, invoice.currency), right - 90);
    nl(10);
    rules.push({ x1: left, x2: right, y });
    nl(20);
    put("Total", right - 200, { bold: true, size: 12 });
    put(formatMoney(amount, invoice.currency), right - 90, { bold: true, size: 12 });
    nl(34);

    if (isPaid) {
      put("Pago recibido", left, { bold: true, size: 12 });
      nl();
      put(`Método: ${invoice.paymentMethod ?? "manual"}`, left, { size: 10 });
      nl(13);
      if (invoice.paymentReference) {
        put(`Referencia: ${invoice.paymentReference}`, left, { size: 10 });
        nl(13);
      }
      put("Gracias por tu pago. Tu plan queda activo por el período indicado.", left, { size: 10 });
    } else {
      put("Cómo pagar", left, { bold: true, size: 12 });
      nl();
      put(
        "Realizá el pago por transferencia o el medio acordado y envianos el comprobante",
        left,
        { size: 10 },
      );
      nl(13);
      put(
        "respondiendo al correo. Al confirmarlo activamos o renovamos tu plan de inmediato.",
        left,
        { size: 10 },
      );
      nl(13);
      put(
        "Si el pago no se registra antes del vencimiento, la cuenta se suspende automáticamente.",
        left,
        { size: 10 },
      );
    }

    lines.push({
      text: "Documento generado por moSend.",
      x: left,
      y: 48,
      size: 8,
    });

    return renderSimplePdf({ lines, rules });
  }

  static async renderPdfById(id: string): Promise<{ filename: string; pdf: Buffer } | null> {
    const invoice = await InvoiceService.getWithParties(id);
    if (!invoice) return null;
    return { filename: InvoiceService.fileName(invoice), pdf: InvoiceService.renderPdf(invoice) };
  }

  // Sequential per-year numbering (MS-2026-0001). Concurrency is resolved by
  // the unique constraint: on a collision the next number is retried.
  private static async createWithNumber(
    data: Omit<Prisma.PlanInvoiceUncheckedCreateInput, "number">,
  ): Promise<PlanInvoice> {
    const year = new Date().getUTCFullYear();
    const prefix = `${NUMBER_PREFIX}-${year}-`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await db.planInvoice.count({
        where: { number: { startsWith: prefix } },
      });
      const number = `${prefix}${String(count + 1 + attempt).padStart(4, "0")}`;
      try {
        return await db.planInvoice.create({ data: { ...data, number } });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          logger.warn({ number }, "[Invoice] Number collision, retrying");
          continue;
        }
        throw err;
      }
    }
    throw new Error("Could not allocate an invoice number");
  }
}
