import type { Context, Hono } from "hono";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PlanActivationStatus, PlanInvoiceStatus } from "@prisma/client";
import { db } from "~/server/db";
import { UnsendApiError } from "../public-api/api-error";
import { ClientService } from "../service/client-service";
import { PlanActivationService } from "../service/plan-activation-service";
import { InvoiceService } from "../service/invoice-service";

// Sales & customer endpoints of the admin API (/api/admin/*), meant for
// external automations (n8n, scripts, the portal). Same bearer key as the
// provisioning endpoints. Every action is attributed to the operator user
// resolved by ClientService.resolveActorId.

// eslint-disable-next-line no-unused-vars
type JsonBody = <T extends z.ZodTypeAny>(raw: unknown, schema: T) => Promise<z.infer<T>>;

const TRPC_TO_API: Record<string, "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | "INTERNAL_SERVER_ERROR"> = {
  BAD_REQUEST: "BAD_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHORIZED: "UNAUTHORIZED",
};

// Services throw TRPCError; translate so handleError renders a proper status.
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TRPCError) {
      throw new UnsendApiError({
        code: TRPC_TO_API[err.code] ?? "INTERNAL_SERVER_ERROR",
        message: err.message,
      });
    }
    throw err;
  }
}

function intParam(c: Context, name: string): number {
  const value = Number.parseInt(c.req.param(name) ?? "", 10);
  if (!Number.isFinite(value)) {
    throw new UnsendApiError({ code: "BAD_REQUEST", message: `Invalid ${name}` });
  }
  return value;
}

function intQuery(c: Context, name: string): number | undefined {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new UnsendApiError({ code: "BAD_REQUEST", message: `Invalid ${name}` });
  }
  return value;
}

// Optional JSON body: an empty body is treated as {}.
async function optionalJson(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new UnsendApiError({ code: "BAD_REQUEST", message: "Invalid JSON body" });
  }
}

function enumQuery<T extends z.ZodTypeAny>(c: Context, name: string, schema: T): z.infer<T> | undefined {
  const raw = c.req.query(name);
  if (!raw) return undefined;
  const parsed = schema.safeParse(raw.toUpperCase());
  if (!parsed.success) {
    throw new UnsendApiError({ code: "BAD_REQUEST", message: `Invalid ${name}` });
  }
  return parsed.data;
}

function boolQuery(c: Context, name: string): boolean | undefined {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return undefined;
  return raw === "true" || raw === "1";
}

// Plans may be addressed by numeric id or by key ("orbita").
const planRef = z
  .object({
    planId: z.number().int().positive().optional(),
    planKey: z.string().min(1).optional(),
  })
  .partial();

async function resolvePlanId(ref: { planId?: number; planKey?: string }): Promise<number> {
  if (ref.planId !== undefined) return ref.planId;
  if (!ref.planKey) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "planId or planKey is required",
    });
  }
  const plan = await db.pricingPlan.findUnique({ where: { key: ref.planKey } });
  if (!plan) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: `PricingPlan with key '${ref.planKey}' not found`,
    });
  }
  return plan.id;
}

// The operator team: explicit teamId, or the only team on a single-tenant
// install.
async function resolveTeamId(explicit?: number): Promise<number> {
  if (explicit !== undefined) return explicit;
  const teams = await db.team.findMany({ select: { id: true }, take: 2 });
  if (teams.length === 1) return teams[0]!.id;
  throw new UnsendApiError({
    code: "BAD_REQUEST",
    message: "teamId is required when more than one team exists",
  });
}

const paymentFields = {
  paymentMethod: z.string().max(80).nullable().optional(),
  paymentReference: z.string().max(200).nullable().optional(),
  adminNotes: z.string().max(1000).nullable().optional(),
};

export function registerSalesRoutes(app: Hono, deps: { jsonBody: JsonBody }) {
  const { jsonBody } = deps;

  // ---- Plans ---------------------------------------------------------------

  app.get("/admin/plans", async (c) => {
    const plans = await db.pricingPlan.findMany({ orderBy: { sortOrder: "asc" } });
    return c.json(
      plans.map((p) => ({ ...p, priceMonthly: Number(p.priceMonthly) })),
    );
  });

  // ---- Clients -------------------------------------------------------------

  app.get("/admin/clients", async (c) => {
    const result = await ClientService.list({
      search: c.req.query("search") || undefined,
      planId: intQuery(c, "planId"),
      blocked: boolQuery(c, "blocked"),
      teamId: intQuery(c, "teamId"),
      page: intQuery(c, "page"),
      pageSize: intQuery(c, "pageSize"),
    });
    return c.json(result);
  });

  const createClientSchema = z
    .object({
      teamId: z.number().int().positive().optional(),
      email: z.string().email(),
      name: z.string().max(120).nullable().optional(),
      domainIds: z.array(z.number().int()).max(50).optional(),
      periodDays: z.number().int().min(0).max(3650).nullable().optional(),
      sendWelcomeEmail: z.boolean().optional(),
      ...paymentFields,
    })
    .merge(planRef);
  app.post("/admin/clients", async (c) => {
    const body = await jsonBody(await c.req.json(), createClientSchema);
    const teamId = await resolveTeamId(body.teamId);
    const planId =
      body.planId !== undefined || body.planKey !== undefined
        ? await resolvePlanId(body)
        : null;
    const adminUserId = await run(() => ClientService.resolveActorId(teamId));
    const result = await run(() =>
      ClientService.createClient({
        teamId,
        email: body.email,
        name: body.name,
        domainIds: body.domainIds,
        planId,
        periodDays: body.periodDays,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
        adminNotes: body.adminNotes,
        sendWelcomeEmail: body.sendWelcomeEmail,
        adminUserId,
      }),
    );
    return c.json(result, result.created ? 201 : 200);
  });

  app.get("/admin/clients/:userId", async (c) => {
    const client = await ClientService.get(intParam(c, "userId"));
    if (!client) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Client not found" });
    }
    return c.json(client);
  });

  // Assign or renew a plan (records the payment, emails the factura).
  const assignSchema = z
    .object({
      periodDays: z.number().int().min(0).max(3650).nullable().optional(),
      ...paymentFields,
    })
    .merge(planRef);
  app.post("/admin/clients/:userId/plan", async (c) => {
    const userId = intParam(c, "userId");
    const body = await jsonBody(await c.req.json(), assignSchema);
    const planId = await resolvePlanId(body);
    const client = await ClientService.get(userId);
    if (!client) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Client not found" });
    }
    const adminUserId = await run(() => ClientService.resolveActorId(client.team.id));
    const activation = await run(() =>
      PlanActivationService.manualAssign({
        teamId: client.team.id,
        planId,
        targetUserId: userId,
        adminUserId,
        periodDays: body.periodDays,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
        adminNotes: body.adminNotes,
      }),
    );
    return c.json({
      activationId: activation.id,
      status: activation.status,
      expiresAt: activation.expiresAt,
    });
  });

  // Issue a cuenta de cobro (emailed with PDF) to be paid later.
  const issueSchema = z
    .object({ periodDays: z.number().int().min(1).max(3650).nullable().optional() })
    .merge(planRef);
  app.post("/admin/clients/:userId/invoices", async (c) => {
    const userId = intParam(c, "userId");
    const body = await jsonBody(await c.req.json(), issueSchema);
    const planId = await resolvePlanId(body);
    const client = await ClientService.get(userId);
    if (!client) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Client not found" });
    }
    const adminUserId = await run(() => ClientService.resolveActorId(client.team.id));
    const invoice = await run(() =>
      PlanActivationService.issueInvoice({
        teamId: client.team.id,
        userId,
        planId,
        periodDays: body.periodDays,
        adminUserId,
      }),
    );
    return c.json(
      { ...invoice, amount: Number(invoice.amount) },
      201,
    );
  });

  const blockSchema = z.object({ reason: z.string().max(500).nullable().optional() });
  app.post("/admin/clients/:userId/block", async (c) => {
    const userId = intParam(c, "userId");
    const body = await jsonBody(await optionalJson(c), blockSchema);
    const user = await run(() => PlanActivationService.setUserBlocked(userId, true, body.reason));
    return c.json(user);
  });

  app.post("/admin/clients/:userId/unblock", async (c) => {
    const userId = intParam(c, "userId");
    const user = await run(() => PlanActivationService.setUserBlocked(userId, false));
    return c.json(user);
  });

  const domainsSchema = z.object({
    teamId: z.number().int().positive().optional(),
    domainIds: z.array(z.number().int()).min(1).max(50),
  });
  app.post("/admin/clients/:userId/domains", async (c) => {
    const userId = intParam(c, "userId");
    const body = await jsonBody(await c.req.json(), domainsSchema);
    const teamId = await resolveTeamId(body.teamId);
    const domains = await run(() =>
      ClientService.setDomains(userId, teamId, body.domainIds, "grant"),
    );
    return c.json({ domains });
  });

  app.delete("/admin/clients/:userId/domains", async (c) => {
    const userId = intParam(c, "userId");
    const body = await jsonBody(await c.req.json(), domainsSchema);
    const teamId = await resolveTeamId(body.teamId);
    const domains = await run(() =>
      ClientService.setDomains(userId, teamId, body.domainIds, "revoke"),
    );
    return c.json({ domains });
  });

  // ---- Invoices ------------------------------------------------------------

  app.get("/admin/invoices", async (c) => {
    const status = enumQuery(c, "status", z.nativeEnum(PlanInvoiceStatus));
    const result = await InvoiceService.listAll({
      status,
      search: c.req.query("search") || undefined,
      page: intQuery(c, "page"),
      pageSize: intQuery(c, "pageSize"),
    });
    return c.json(result);
  });

  app.get("/admin/invoices/:id", async (c) => {
    const invoice = await InvoiceService.getWithParties((c.req.param("id") ?? ""));
    if (!invoice) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Invoice not found" });
    }
    return c.json({ ...invoice, amount: Number(invoice.amount) });
  });

  app.get("/admin/invoices/:id/pdf", async (c) => {
    const rendered = await InvoiceService.renderPdfById((c.req.param("id") ?? ""));
    if (!rendered) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Invoice not found" });
    }
    return new Response(new Uint8Array(rendered.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${rendered.filename}"`,
      },
    });
  });

  const paySchema = z.object({
    paymentMethod: z.string().max(80).nullable().optional(),
    paymentReference: z.string().max(200).nullable().optional(),
  });
  app.post("/admin/invoices/:id/pay", async (c) => {
    const id = (c.req.param("id") ?? "");
    const body = await jsonBody(await optionalJson(c), paySchema);
    const invoice = await InvoiceService.getById(id);
    if (!invoice) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Invoice not found" });
    }
    const adminUserId = await run(() => ClientService.resolveActorId(invoice.teamId));
    const activation = await run(() =>
      PlanActivationService.registerInvoicePayment({
        invoiceId: id,
        adminUserId,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
      }),
    );
    const paid = await InvoiceService.getById(id);
    return c.json({
      invoice: paid ? { ...paid, amount: Number(paid.amount) } : null,
      activationId: activation.id,
      expiresAt: activation.expiresAt,
    });
  });

  app.post("/admin/invoices/:id/void", async (c) => {
    try {
      const invoice = await InvoiceService.void((c.req.param("id") ?? ""));
      return c.json({ ...invoice, amount: Number(invoice.amount) });
    } catch (err) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: err instanceof Error ? err.message : "Could not void invoice",
      });
    }
  });

  app.post("/admin/invoices/:id/resend", async (c) => {
    await run(() => PlanActivationService.resendInvoice((c.req.param("id") ?? "")));
    return c.json({ ok: true });
  });

  // ---- Activations ---------------------------------------------------------

  app.get("/admin/activations", async (c) => {
    const status = enumQuery(c, "status", z.nativeEnum(PlanActivationStatus));
    const result = await PlanActivationService.listForAdmin({
      status,
      page: intQuery(c, "page"),
      pageSize: intQuery(c, "pageSize"),
    });
    return c.json(result);
  });

  const approveSchema = z.object({
    periodDays: z.number().int().min(0).max(3650).nullable().optional(),
    paymentReference: z.string().max(200).nullable().optional(),
    adminNotes: z.string().max(1000).nullable().optional(),
  });
  app.post("/admin/activations/:id/approve", async (c) => {
    const id = (c.req.param("id") ?? "");
    const body = await jsonBody(await optionalJson(c), approveSchema);
    const req = await PlanActivationService.getById(id);
    if (!req) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Activation not found" });
    }
    const adminUserId = await run(() => ClientService.resolveActorId(req.teamId));
    const updated = await run(() =>
      PlanActivationService.approve({
        requestId: id,
        reviewedByUserId: adminUserId,
        periodDays: body.periodDays,
        paymentReference: body.paymentReference,
        adminNotes: body.adminNotes,
      }),
    );
    return c.json(updated);
  });

  const rejectSchema = z.object({
    rejectionReason: z.string().min(3).max(500),
    adminNotes: z.string().max(1000).nullable().optional(),
  });
  app.post("/admin/activations/:id/reject", async (c) => {
    const id = (c.req.param("id") ?? "");
    const body = await jsonBody(await c.req.json(), rejectSchema);
    const req = await PlanActivationService.getById(id);
    if (!req) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Activation not found" });
    }
    const adminUserId = await run(() => ClientService.resolveActorId(req.teamId));
    const updated = await run(() =>
      PlanActivationService.reject({
        requestId: id,
        reviewedByUserId: adminUserId,
        rejectionReason: body.rejectionReason,
        adminNotes: body.adminNotes,
      }),
    );
    return c.json(updated);
  });
}
