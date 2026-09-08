import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockActivation, mockMailer } = vi.hoisted(() => {
  const mockDb = {
    team: { findUnique: vi.fn() },
    domain: { count: vi.fn(), findMany: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    teamUser: { create: vi.fn() },
    clientDomainAccess: { createMany: vi.fn() },
  };
  return {
    mockDb,
    mockActivation: { manualAssign: vi.fn() },
    mockMailer: { sendClientWelcomeEmail: vi.fn() },
  };
});

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/service/plan-activation-service", () => ({
  PlanActivationService: mockActivation,
}));
vi.mock("~/server/mailer", () => mockMailer);

import { ClientService } from "~/server/service/client-service";

describe("ClientService.createClient", () => {
  beforeEach(() => {
    Object.values(mockDb).forEach((table) =>
      Object.values(table).forEach((fn) => (fn as any).mockReset()),
    );
    mockActivation.manualAssign.mockReset();
    mockMailer.sendClientWelcomeEmail.mockReset();
    mockDb.team.findUnique.mockResolvedValue({ id: 1 });
  });

  it("creates the user as CLIENT, grants domains, activates the plan and welcomes them", async () => {
    mockDb.domain.count.mockResolvedValue(2);
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.user.create.mockResolvedValue({ id: 42 });
    mockDb.domain.findMany.mockResolvedValue([
      { name: "acme.com" },
      { name: "mail.acme.com" },
    ]);
    mockActivation.manualAssign.mockResolvedValue({ id: "req_1" });

    const result = await ClientService.createClient({
      teamId: 1,
      email: "  Cliente@Acme.com ",
      name: "Acme",
      domainIds: [10, 11, 10],
      planId: 5,
      periodDays: 30,
      paymentMethod: "Transferencia",
      adminUserId: 1,
    });

    expect(result).toEqual({
      userId: 42,
      email: "cliente@acme.com",
      created: true,
      activationId: "req_1",
    });
    expect(mockDb.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "cliente@acme.com",
          name: "Acme",
          teamUsers: { create: { teamId: 1, role: "CLIENT" } },
        }),
      }),
    );
    expect(mockDb.clientDomainAccess.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 42, domainId: 10, teamId: 1 },
        { userId: 42, domainId: 11, teamId: 1 },
      ],
      skipDuplicates: true,
    });
    expect(mockActivation.manualAssign).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 1,
        planId: 5,
        targetUserId: 42,
        periodDays: 30,
        adminUserId: 1,
      }),
    );
    expect(mockMailer.sendClientWelcomeEmail).toHaveBeenCalledWith(
      "cliente@acme.com",
      { name: "Acme", domains: ["acme.com", "mail.acme.com"] },
    );
  });

  it("rejects domains that belong to another team", async () => {
    mockDb.domain.count.mockResolvedValue(1);

    await expect(
      ClientService.createClient({
        teamId: 1,
        email: "x@acme.com",
        domainIds: [10, 99],
        adminUserId: 1,
      }),
    ).rejects.toThrow(/no pertenece/i);
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it("re-uses an existing user and only adds the CLIENT membership", async () => {
    mockDb.user.findFirst.mockResolvedValue({
      id: 7,
      name: "Ya existe",
      teamUsers: [],
    });

    const result = await ClientService.createClient({
      teamId: 1,
      email: "x@acme.com",
      adminUserId: 1,
      sendWelcomeEmail: false,
    });

    expect(result.created).toBe(false);
    expect(mockDb.teamUser.create).toHaveBeenCalledWith({
      data: { teamId: 1, userId: 7, role: "CLIENT" },
    });
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockActivation.manualAssign).not.toHaveBeenCalled();
    expect(mockMailer.sendClientWelcomeEmail).not.toHaveBeenCalled();
  });

  it("refuses to demote an ADMIN of the team into a client", async () => {
    mockDb.user.findFirst.mockResolvedValue({
      id: 1,
      teamUsers: [{ teamId: 1, role: "ADMIN" }],
    });

    await expect(
      ClientService.createClient({
        teamId: 1,
        email: "info@moshipp.com",
        adminUserId: 1,
      }),
    ).rejects.toThrow(/ya es ADMIN/);
  });

  it("refuses emails that belong to another team", async () => {
    mockDb.user.findFirst.mockResolvedValue({
      id: 9,
      teamUsers: [{ teamId: 2, role: "CLIENT" }],
    });

    await expect(
      ClientService.createClient({
        teamId: 1,
        email: "x@acme.com",
        adminUserId: 1,
      }),
    ).rejects.toThrow(/otro team/);
  });

  it("a failing welcome email does not fail the onboarding", async () => {
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.user.create.mockResolvedValue({ id: 42 });
    mockMailer.sendClientWelcomeEmail.mockRejectedValue(new Error("smtp"));

    const result = await ClientService.createClient({
      teamId: 1,
      email: "x@acme.com",
      adminUserId: 1,
    });

    expect(result.userId).toBe(42);
  });
});
