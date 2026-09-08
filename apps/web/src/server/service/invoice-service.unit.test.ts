import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    planInvoice: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/env", () => ({
  env: {
    INVOICE_ISSUER_NAME: "Moshipp SAS",
    INVOICE_ISSUER_DETAILS: "NIT 900.000.000-1 | Bogotá, Colombia",
  },
}));

import { InvoiceService, formatMoney } from "~/server/service/invoice-service";
import { renderSimplePdf } from "~/server/utils/simple-pdf";

const plan = { id: 5, name: "Órbita", priceMonthly: 19, currency: "USD" };

describe("InvoiceService", () => {
  beforeEach(() => {
    Object.values(mockDb.planInvoice).forEach((f) => (f as any).mockReset());
  });

  it("free plans are not billable", () => {
    expect(InvoiceService.isBillable({ ...plan, priceMonthly: 0 })).toBe(false);
    expect(InvoiceService.isBillable(plan)).toBe(true);
  });

  it("numbers invoices sequentially per year", async () => {
    mockDb.planInvoice.count.mockResolvedValue(6);
    mockDb.planInvoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv", ...data }));

    const invoice = await InvoiceService.createPending({
      teamId: 1,
      userId: 77,
      activationRequestId: "req_1",
      plan,
      periodStart: new Date("2026-10-07T00:00:00Z"),
      periodEnd: new Date("2026-11-06T00:00:00Z"),
      dueAt: new Date("2026-10-07T00:00:00Z"),
    });

    const year = new Date().getUTCFullYear();
    expect(invoice.number).toBe(`MS-${year}-0007`);
    expect(invoice.status).toBe("ISSUED");
    expect(Number(invoice.amount)).toBe(19);
    expect(invoice.description).toContain("Plan Órbita");
  });

  it("reuses the open cuenta de cobro of the same activation", async () => {
    mockDb.planInvoice.findFirst.mockResolvedValue({ id: "existing", number: "MS-2026-0001" });

    const invoice = await InvoiceService.createPending({
      teamId: 1,
      userId: 77,
      activationRequestId: "req_1",
      plan,
      periodStart: new Date(),
      periodEnd: new Date(),
      dueAt: new Date(),
    });

    expect(invoice.id).toBe("existing");
    expect(mockDb.planInvoice.create).not.toHaveBeenCalled();
  });

  it("recordPayment settles the open invoice instead of creating a new one", async () => {
    mockDb.planInvoice.findFirst.mockResolvedValue({ id: "open_1", planId: 5 });
    mockDb.planInvoice.update.mockImplementation(async ({ data }: any) => ({ id: "open_1", ...data }));

    const paid = await InvoiceService.recordPayment({
      teamId: 1,
      userId: 77,
      activationRequestId: "req_2",
      plan,
      periodStart: new Date("2026-10-07T00:00:00Z"),
      periodEnd: new Date("2026-11-06T00:00:00Z"),
      paymentMethod: "Transferencia",
      paymentReference: "TX-9",
      paidAt: new Date("2026-10-05T00:00:00Z"),
    });

    expect(paid.status).toBe("PAID");
    expect(paid.paymentReference).toBe("TX-9");
    expect(mockDb.planInvoice.create).not.toHaveBeenCalled();
  });

  it("recordPayment issues a paid invoice when nothing was pending", async () => {
    mockDb.planInvoice.findFirst.mockResolvedValue(null);
    mockDb.planInvoice.count.mockResolvedValue(0);
    mockDb.planInvoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv", ...data }));

    const paid = await InvoiceService.recordPayment({
      teamId: 1,
      userId: 77,
      activationRequestId: "req_2",
      plan,
      periodStart: new Date(),
      periodEnd: new Date(),
      paidAt: new Date(),
    });

    expect(paid.status).toBe("PAID");
    expect(paid.number).toMatch(/^MS-\d{4}-0001$/);
  });

  it("retries the number on a unique collision", async () => {
    mockDb.planInvoice.findFirst.mockResolvedValue(null);
    mockDb.planInvoice.count.mockResolvedValue(3);
    const { Prisma } = await import("@prisma/client");
    mockDb.planInvoice.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
      )
      .mockImplementationOnce(async ({ data }: any) => ({ id: "inv", ...data }));

    const paid = await InvoiceService.recordPayment({
      teamId: 1,
      userId: 77,
      activationRequestId: "req_2",
      plan,
      periodStart: new Date(),
      periodEnd: new Date(),
      paidAt: new Date(),
    });

    expect(paid.number).toMatch(/-0005$/);
  });

  it("renders a valid one-page PDF with the issuer, number and total", () => {
    const pdf = InvoiceService.renderPdf({
      id: "inv",
      number: "MS-2026-0012",
      teamId: 1,
      userId: 77,
      activationRequestId: null,
      planId: 5,
      planName: "Órbita",
      description: "Plan Órbita · 07/10/2026 a 06/11/2026",
      amount: 19 as any,
      currency: "USD",
      status: "ISSUED",
      periodStart: new Date("2026-10-07T00:00:00Z"),
      periodEnd: new Date("2026-11-06T00:00:00Z"),
      issuedAt: new Date("2026-09-30T00:00:00Z"),
      dueAt: new Date("2026-10-07T00:00:00Z"),
      paidAt: null,
      paymentMethod: null,
      paymentReference: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      team: { name: "MosendMail", billingEmail: null },
      user: { name: "Cliente Prueba", email: "cliente@acme.com" },
    });

    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Moshipp SAS");
    expect(text).toContain("CUENTA DE COBRO");
    expect(text).toContain("MS-2026-0012");
    expect(text).toContain("cliente@acme.com");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // xref offset must point at the xref table
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("formats money without throwing on unknown currencies", () => {
    expect(formatMoney(19, "USD")).toContain("19");
    expect(formatMoney(5, "XXX-BAD")).toBe("XXX-BAD 5.00");
  });
});

describe("renderSimplePdf", () => {
  it("escapes parentheses and keeps offsets consistent", () => {
    const pdf = renderSimplePdf({
      lines: [{ text: "Plan (mensual) \\ ok", x: 50, y: 700 }],
    });
    const text = pdf.toString("latin1");
    expect(text).toContain("(Plan \\(mensual\\) \\\\ ok) Tj");
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((offset, i) => {
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });
});
