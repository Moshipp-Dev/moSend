import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockClient, mockActivation, mockInvoice } = vi.hoisted(() => ({
  mockDb: {
    pricingPlan: { findMany: vi.fn(), findUnique: vi.fn() },
    team: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    teamUser: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
  mockClient: {
    list: vi.fn(),
    get: vi.fn(),
    createClient: vi.fn(),
    setDomains: vi.fn(),
    resolveActorId: vi.fn(),
  },
  mockActivation: {
    manualAssign: vi.fn(),
    issueInvoice: vi.fn(),
    setUserBlocked: vi.fn(),
    registerInvoicePayment: vi.fn(),
    resendInvoice: vi.fn(),
    listForAdmin: vi.fn(),
    getById: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
  mockInvoice: {
    listAll: vi.fn(),
    getById: vi.fn(),
    getWithParties: vi.fn(),
    renderPdfById: vi.fn(),
    void: vi.fn(),
  },
}));

vi.mock("~/env", () => ({
  env: { PORTAL_ADMIN_API_KEY: "test-admin-key-with-at-least-32-chars!!" },
}));
vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/service/client-service", () => ({ ClientService: mockClient }));
vi.mock("~/server/service/plan-activation-service", () => ({
  PlanActivationService: mockActivation,
}));
vi.mock("~/server/service/invoice-service", () => ({ InvoiceService: mockInvoice }));
vi.mock("~/server/service/team-service", () => ({ TeamService: {} }));
vi.mock("~/server/service/plan-service", () => ({ PlanService: {} }));
vi.mock("~/server/service/usage-service", () => ({ getThisMonthUsage: vi.fn() }));

import { TRPCError } from "@trpc/server";
import { getAdminApp } from "~/server/admin-api";

const AUTH = { Authorization: "Bearer test-admin-key-with-at-least-32-chars!!" };
const json = (body: unknown) => ({
  method: "POST",
  headers: { ...AUTH, "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("admin sales API", () => {
  beforeEach(() => {
    [mockDb, mockClient, mockActivation, mockInvoice].forEach((group) =>
      Object.values(group).forEach((entry) => {
        if (typeof entry === "function") (entry as any).mockReset();
        else Object.values(entry).forEach((fn) => (fn as any).mockReset());
      }),
    );
    mockDb.team.findMany.mockResolvedValue([{ id: 1 }]);
    mockClient.resolveActorId.mockResolvedValue(7);
  });

  it("rejects requests without the admin key", async () => {
    const app = getAdminApp();
    const res = await app.request("http://localhost/api/admin/clients");
    expect(res.status).toBe(401);
  });

  it("lists clients with parsed filters", async () => {
    mockClient.list.mockResolvedValue({ total: 0, clients: [], page: 2, pageSize: 10 });
    const app = getAdminApp();
    const res = await app.request(
      "http://localhost/api/admin/clients?search=acme&blocked=true&page=2&pageSize=10",
      { headers: AUTH },
    );
    expect(res.status).toBe(200);
    expect(mockClient.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: "acme", blocked: true, page: 2, pageSize: 10 }),
    );
  });

  it("creates a client on the single team, resolving the plan by key", async () => {
    mockDb.pricingPlan.findUnique.mockResolvedValue({ id: 4, key: "orbita" });
    mockClient.createClient.mockResolvedValue({
      userId: 42,
      email: "cliente@acme.com",
      created: true,
      activationId: "req_1",
    });
    const app = getAdminApp();
    const res = await app.request(
      "http://localhost/api/admin/clients",
      json({ email: "cliente@acme.com", name: "Acme", planKey: "orbita", periodDays: 30 }),
    );
    expect(res.status).toBe(201);
    expect(mockClient.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 1, planId: 4, periodDays: 30, adminUserId: 7 }),
    );
  });

  it("maps service errors to API errors", async () => {
    mockClient.get.mockResolvedValue({ userId: 42, team: { id: 1 } });
    mockActivation.manualAssign.mockRejectedValue(
      new TRPCError({ code: "BAD_REQUEST", message: "Este plan no está disponible actualmente" }),
    );
    const app = getAdminApp();
    const res = await app.request(
      "http://localhost/api/admin/clients/42/plan",
      json({ planId: 9 }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/no está disponible/);
  });

  it("requires planId or planKey when assigning", async () => {
    mockClient.get.mockResolvedValue({ userId: 42, team: { id: 1 } });
    const app = getAdminApp();
    const res = await app.request("http://localhost/api/admin/clients/42/plan", json({}));
    expect(res.status).toBe(400);
  });

  it("registers an invoice payment with an empty body", async () => {
    mockInvoice.getById
      .mockResolvedValueOnce({ id: "inv_1", teamId: 1, status: "ISSUED" })
      .mockResolvedValueOnce({ id: "inv_1", status: "PAID", amount: 10 });
    mockActivation.registerInvoicePayment.mockResolvedValue({
      id: "req_2",
      expiresAt: new Date("2026-11-07T00:00:00Z"),
    });
    const app = getAdminApp();
    const res = await app.request("http://localhost/api/admin/invoices/inv_1/pay", {
      method: "POST",
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoice.status).toBe("PAID");
    expect(body.activationId).toBe("req_2");
    expect(mockActivation.registerInvoicePayment).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "inv_1", adminUserId: 7 }),
    );
  });

  it("serves the invoice PDF", async () => {
    mockInvoice.renderPdfById.mockResolvedValue({
      filename: "factura-MS-2026-0001.pdf",
      pdf: Buffer.from("%PDF-1.4 test"),
    });
    const app = getAdminApp();
    const res = await app.request("http://localhost/api/admin/invoices/inv_1/pdf", {
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("factura-MS-2026-0001.pdf");
    expect(await res.text()).toBe("%PDF-1.4 test");
  });

  it("validates the status filter on invoices", async () => {
    const app = getAdminApp();
    const res = await app.request("http://localhost/api/admin/invoices?status=nope", {
      headers: AUTH,
    });
    expect(res.status).toBe(400);
  });

  it("blocks a client with a reason", async () => {
    mockActivation.setUserBlocked.mockResolvedValue({ id: 42, isBlocked: true });
    const app = getAdminApp();
    const res = await app.request(
      "http://localhost/api/admin/clients/42/block",
      json({ reason: "Pago pendiente" }),
    );
    expect(res.status).toBe(200);
    expect(mockActivation.setUserBlocked).toHaveBeenCalledWith(42, true, "Pago pendiente");
  });
});
