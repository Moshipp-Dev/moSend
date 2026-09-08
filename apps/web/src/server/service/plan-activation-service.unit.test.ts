import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTeamService, mockPlanService, mockMailer } = vi.hoisted(() => {
  const teamUser = {
    findMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  };
  const domain = {
    findMany: vi.fn(),
  };
  const clientDomainAccess = {
    upsert: vi.fn(),
  };
  const planActivationRequest = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const team = { findUnique: vi.fn(), update: vi.fn() };
  const user = { findUnique: vi.fn(), update: vi.fn() };
  const pricingPlan = { findUnique: vi.fn(), findFirst: vi.fn() };

  const mockDb = {
    pricingPlan,
    team,
    user,
    teamUser,
    domain,
    clientDomainAccess,
    planActivationRequest,
    $transaction: vi.fn(async (arg: any) => {
      if (typeof arg === "function") return arg(mockDb);
      const results: any[] = [];
      for (const op of arg) results.push(await op);
      return results;
    }),
  };

  return {
    mockDb,
    mockTeamService: { refreshTeamCache: vi.fn() },
    mockPlanService: { invalidateTeam: vi.fn(), invalidateUser: vi.fn() },
    mockMailer: {
      sendPlanActivatedEmail: vi.fn(),
      sendPlanRejectedEmail: vi.fn(),
      sendPlanExpiringEmail: vi.fn(),
      sendPlanExpiredEmail: vi.fn(),
    },
  };
});

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/mailer", () => mockMailer);
vi.mock("~/server/service/team-service", () => ({ TeamService: mockTeamService }));
vi.mock("~/server/service/plan-service", () => ({ PlanService: mockPlanService }));

import { PlanActivationService } from "~/server/service/plan-activation-service";

describe("PlanActivationService", () => {
  beforeEach(() => {
    Object.values(mockDb.pricingPlan).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.team).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.user).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.teamUser).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.domain).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.clientDomainAccess).forEach((f) => (f as any).mockReset());
    Object.values(mockDb.planActivationRequest).forEach((f) => (f as any).mockReset());
    (mockDb.$transaction as any).mockClear();
    mockTeamService.refreshTeamCache.mockReset();
    mockPlanService.invalidateTeam.mockReset();
    mockPlanService.invalidateUser.mockReset();
    Object.values(mockMailer).forEach((f) => (f as any).mockReset());
  });

  describe("createRequest", () => {
    it("creates a PENDING request scoped to targetUserId (defaults to requester)", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        isActive: true,
        isEnterprise: false,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.planActivationRequest.findFirst.mockResolvedValue(null);
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        targetUserId: 99,
        status: "PENDING",
      });

      const result = await PlanActivationService.createRequest({
        teamId: 10,
        planId: 5,
        requestedByUserId: 99,
      });

      expect(result.status).toBe("PENDING");
      expect(mockDb.planActivationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetUserId: 99 }),
        }),
      );
    });

    it("rejects enterprise plans", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 7,
        isActive: true,
        isEnterprise: true,
      });

      await expect(
        PlanActivationService.createRequest({
          teamId: 10,
          planId: 7,
          requestedByUserId: 99,
        }),
      ).rejects.toThrow(/empresariales/i);
    });

    it("rejects when plan is inactive", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        isActive: false,
        isEnterprise: false,
      });

      await expect(
        PlanActivationService.createRequest({
          teamId: 10,
          planId: 5,
          requestedByUserId: 99,
        }),
      ).rejects.toThrow(/no está disponible/i);
    });
  });

  describe("approve", () => {
    it("when targetUserId is set, assigns plan to the user (not the team)", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        targetUserId: 77,
        status: "PENDING",
        plan: { key: "orbita", id: 5 },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
      });

      const result = await PlanActivationService.approve({
        requestId: "req_1",
        reviewedByUserId: 1,
      });

      expect(result.status).toBe("APPROVED");
      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 77 },
          data: { pricingPlan: { connect: { id: 5 } } },
        }),
      );
      expect(mockDb.team.update).not.toHaveBeenCalled();
      expect(mockPlanService.invalidateUser).toHaveBeenCalledWith(77);
    });

    it("sets a 30-day expiry by default, closes previous active periods and emails the user", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        targetUserId: 77,
        status: "PENDING",
        plan: { key: "orbita", id: 5, name: "Órbita" },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
      });
      mockDb.user.findUnique.mockResolvedValue({ email: "cliente@acme.com" });

      const before = Date.now();
      await PlanActivationService.approve({
        requestId: "req_1",
        reviewedByUserId: 1,
      });

      const updateArg = mockDb.planActivationRequest.update.mock.calls[0]![0];
      const expiresAt: Date = updateArg.data.expiresAt;
      const days = (expiresAt.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThan(30.1);

      expect(mockDb.planActivationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: 10,
            targetUserId: 77,
            status: "APPROVED",
            id: { not: "req_1" },
          }),
          data: expect.objectContaining({ status: "EXPIRED" }),
        }),
      );
      expect(mockMailer.sendPlanActivatedEmail).toHaveBeenCalledWith(
        "cliente@acme.com",
        expect.objectContaining({ planName: "Órbita", expiresAt }),
      );
    });

    it("periodDays 0 means no expiry", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        targetUserId: 77,
        status: "PENDING",
        plan: { key: "orbita", id: 5, name: "Órbita" },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({ id: "req_1" });

      await PlanActivationService.approve({
        requestId: "req_1",
        reviewedByUserId: 1,
        periodDays: 0,
      });

      const updateArg = mockDb.planActivationRequest.update.mock.calls[0]![0];
      expect(updateArg.data.expiresAt).toBeNull();
    });

    it("a failing notification never rolls back the approval", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        planId: 5,
        targetUserId: 77,
        status: "PENDING",
        plan: { key: "orbita", id: 5, name: "Órbita" },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
      });
      mockDb.user.findUnique.mockResolvedValue({ email: "cliente@acme.com" });
      mockMailer.sendPlanActivatedEmail.mockRejectedValue(new Error("smtp down"));

      const result = await PlanActivationService.approve({
        requestId: "req_1",
        reviewedByUserId: 1,
      });
      expect(result.status).toBe("APPROVED");
    });

    it("without targetUserId, falls back to assigning the plan to the team", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_legacy",
        teamId: 10,
        planId: 5,
        targetUserId: null,
        status: "PENDING",
        plan: { key: "orbita", id: 5 },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_legacy",
        status: "APPROVED",
      });

      await PlanActivationService.approve({
        requestId: "req_legacy",
        reviewedByUserId: 1,
      });

      expect(mockDb.team.update).toHaveBeenCalled();
      expect(mockDb.user.update).not.toHaveBeenCalled();
    });

    it("refuses to approve already-approved requests", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        status: "APPROVED",
        plan: {},
      });

      await expect(
        PlanActivationService.approve({ requestId: "req_1", reviewedByUserId: 1 }),
      ).rejects.toThrow(/APPROVED/);
    });
  });

  describe("manualAssign", () => {
    it("with targetUserId, requires the user to belong to the team", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.teamUser.findUnique.mockResolvedValue(null);

      await expect(
        PlanActivationService.manualAssign({
          teamId: 10,
          planId: 5,
          adminUserId: 7,
          targetUserId: 99,
        }),
      ).rejects.toThrow(/no pertenece/i);
    });

    it("assigns per-user plan + records APPROVED request with targetUserId", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.teamUser.findUnique.mockResolvedValue({ teamId: 10, userId: 99, role: "CLIENT" });
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_manual",
        status: "APPROVED",
        targetUserId: 99,
      });

      await PlanActivationService.manualAssign({
        teamId: 10,
        planId: 5,
        adminUserId: 7,
        targetUserId: 99,
        paymentReference: "bancolombia-tx-1",
      });

      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99 },
          data: { pricingPlan: { connect: { id: 5 } } },
        }),
      );
      expect(mockDb.team.update).not.toHaveBeenCalled();
      expect(mockDb.planActivationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetUserId: 99, status: "APPROVED" }),
        }),
      );
      expect(mockPlanService.invalidateUser).toHaveBeenCalledWith(99);
    });

    it("without targetUserId, assigns plan to team (legacy)", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: true,
      });
      mockDb.team.findUnique.mockResolvedValue({ id: 10 });
      mockDb.planActivationRequest.create.mockResolvedValue({
        id: "req_legacy",
        status: "APPROVED",
      });

      await PlanActivationService.manualAssign({
        teamId: 10,
        planId: 5,
        adminUserId: 7,
      });

      expect(mockDb.team.update).toHaveBeenCalled();
      expect(mockDb.user.update).not.toHaveBeenCalled();
    });

    it("rejects when plan is inactive", async () => {
      mockDb.pricingPlan.findUnique.mockResolvedValue({
        id: 5,
        key: "orbita",
        isActive: false,
      });

      await expect(
        PlanActivationService.manualAssign({
          teamId: 10,
          planId: 5,
          adminUserId: 7,
        }),
      ).rejects.toThrow(/no está disponible/i);
    });
  });

  describe("reject", () => {
    it("marks request REJECTED with reason", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        status: "PENDING",
      });
      mockDb.planActivationRequest.update.mockResolvedValue({
        id: "req_1",
        status: "REJECTED",
      });

      const result = await PlanActivationService.reject({
        requestId: "req_1",
        reviewedByUserId: 1,
        rejectionReason: "pago no confirmado",
      });

      expect(result.status).toBe("REJECTED");
    });

    it("emails the target user with the rejection reason", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        targetUserId: 77,
        status: "PENDING",
        plan: { name: "Órbita" },
      });
      mockDb.planActivationRequest.update.mockResolvedValue({ status: "REJECTED" });
      mockDb.user.findUnique.mockResolvedValue({ email: "cliente@acme.com" });

      await PlanActivationService.reject({
        requestId: "req_1",
        reviewedByUserId: 1,
        rejectionReason: "pago no confirmado",
      });

      expect(mockMailer.sendPlanRejectedEmail).toHaveBeenCalledWith(
        "cliente@acme.com",
        { planName: "Órbita", reason: "pago no confirmado" },
      );
    });
  });

  describe("expireDue", () => {
    it("downgrades the user to free only when they still hold the expired plan", async () => {
      const now = new Date("2026-10-07T08:00:00Z");
      mockDb.planActivationRequest.findMany.mockResolvedValue([
        {
          id: "req_old",
          teamId: 10,
          planId: 5,
          targetUserId: 77,
          expiresAt: new Date("2026-10-06T00:00:00Z"),
          plan: { name: "Órbita" },
        },
        {
          id: "req_switched",
          teamId: 10,
          planId: 5,
          targetUserId: 78,
          expiresAt: new Date("2026-10-06T00:00:00Z"),
          plan: { name: "Órbita" },
        },
      ]);
      mockDb.pricingPlan.findFirst.mockResolvedValue({ id: 1, key: "free" });
      mockDb.user.findUnique
        .mockResolvedValueOnce({ pricingPlanId: 5 }) // 77 still on the plan
        .mockResolvedValueOnce({ email: "a@acme.com" })
        .mockResolvedValueOnce({ pricingPlanId: 9 }) // 78 moved to another plan
        .mockResolvedValueOnce({ email: "b@acme.com" });
      mockDb.planActivationRequest.update.mockResolvedValue({});

      const count = await PlanActivationService.expireDue(now);

      expect(count).toBe(2);
      expect(mockDb.user.update).toHaveBeenCalledTimes(1);
      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 77 },
          data: { pricingPlanId: 1 },
        }),
      );
      expect(mockDb.planActivationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req_old" },
          data: { status: "EXPIRED", expiredAt: now },
        }),
      );
      expect(mockDb.planActivationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "req_switched" } }),
      );
      expect(mockMailer.sendPlanExpiredEmail).toHaveBeenCalledTimes(2);
    });

    it("does nothing when no activation is due", async () => {
      mockDb.planActivationRequest.findMany.mockResolvedValue([]);
      const count = await PlanActivationService.expireDue();
      expect(count).toBe(0);
      expect(mockDb.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("sendReminders", () => {
    it("sends the 7-day and 1-day reminders once each", async () => {
      const now = new Date("2026-10-01T08:00:00Z");
      const expiring = {
        id: "req_1",
        teamId: 10,
        targetUserId: 77,
        expiresAt: new Date("2026-10-07T08:00:00Z"),
        plan: { name: "Órbita" },
      };
      mockDb.planActivationRequest.findMany
        .mockResolvedValueOnce([expiring]) // 7-day window
        .mockResolvedValueOnce([]); // 1-day window
      mockDb.user.findUnique.mockResolvedValue({ email: "cliente@acme.com" });
      mockDb.planActivationRequest.update.mockResolvedValue({});

      const result = await PlanActivationService.sendReminders(now);

      expect(result).toEqual({ reminders: 1, finalReminders: 0 });
      expect(mockMailer.sendPlanExpiringEmail).toHaveBeenCalledWith(
        "cliente@acme.com",
        expect.objectContaining({ planName: "Órbita", daysLeft: 7 }),
      );
      expect(mockDb.planActivationRequest.update).toHaveBeenCalledWith({
        where: { id: "req_1" },
        data: { reminderSentAt: now },
      });
      const firstQuery = mockDb.planActivationRequest.findMany.mock.calls[0]![0];
      expect(firstQuery.where.reminderSentAt).toBeNull();
      expect(firstQuery.where.expiresAt.lte.toISOString()).toBe(
        "2026-10-08T08:00:00.000Z",
      );
    });
  });

  describe("setUserBlocked", () => {
    it("stores the reason when blocking and clears it when unblocking", async () => {
      mockDb.user.update.mockResolvedValue({ id: 77, isBlocked: true });
      await PlanActivationService.setUserBlocked(77, true, "pago pendiente");
      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 77 },
          data: { isBlocked: true, blockedReason: "pago pendiente" },
        }),
      );
      expect(mockPlanService.invalidateUser).toHaveBeenCalledWith(77);

      mockDb.user.update.mockResolvedValue({ id: 77, isBlocked: false });
      await PlanActivationService.setUserBlocked(77, false, "ignored");
      expect(mockDb.user.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { isBlocked: false, blockedReason: null },
        }),
      );
    });
  });

  describe("cancelOwn", () => {
    it("allows owner to cancel a PENDING request", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        status: "PENDING",
      });
      mockDb.planActivationRequest.update.mockResolvedValue({});

      await expect(
        PlanActivationService.cancelOwn("req_1", 10, 99),
      ).resolves.toBeUndefined();
    });

    it("rejects cancel from a different team", async () => {
      mockDb.planActivationRequest.findUnique.mockResolvedValue({
        id: "req_1",
        teamId: 10,
        status: "PENDING",
      });

      await expect(
        PlanActivationService.cancelOwn("req_1", 999, 99),
      ).rejects.toThrow();
    });
  });
});
