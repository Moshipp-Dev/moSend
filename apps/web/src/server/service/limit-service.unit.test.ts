import { beforeEach, describe, expect, it, vi } from "vitest";
import { LimitReason } from "~/lib/constants/plans";

const { mockDb, mockPlan, mockTeamService, mockUsage } = vi.hoisted(() => ({
  mockDb: {
    domain: { count: vi.fn() },
    contactBook: { count: vi.fn() },
    teamUser: { count: vi.fn() },
    webhook: { count: vi.fn() },
  },
  mockPlan: {
    getPlanForTeam: vi.fn(),
    getLimitsForTeam: vi.fn(),
  },
  mockTeamService: {
    getTeamCached: vi.fn(),
    maybeNotifyEmailLimitReached: vi.fn(),
    sendWarningEmail: vi.fn(),
  },
  mockUsage: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: { NEXT_PUBLIC_IS_CLOUD: true },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));

vi.mock("~/server/service/plan-service", () => ({
  PlanService: mockPlan,
}));

vi.mock("~/server/service/team-service", () => ({
  TeamService: mockTeamService,
}));

vi.mock("~/server/service/usage-service", () => ({
  getThisMonthUsage: mockUsage,
}));

vi.mock("~/server/redis", () => ({
  withCache: async (_k: string, fn: () => Promise<unknown>) => fn(),
}));

import { LimitService } from "~/server/service/limit-service";

describe("LimitService", () => {
  beforeEach(() => {
    Object.values(mockDb).forEach((table) =>
      Object.values(table).forEach((fn) => (fn as any).mockReset()),
    );
    mockPlan.getPlanForTeam.mockReset();
    mockPlan.getLimitsForTeam.mockReset();
    mockTeamService.getTeamCached.mockReset();
    mockTeamService.maybeNotifyEmailLimitReached.mockReset();
    mockTeamService.sendWarningEmail.mockReset();
    mockUsage.mockReset();
  });

  describe("checkDomainLimit", () => {
    it("reports isLimitReached when count >= limit", async () => {
      mockPlan.getLimitsForTeam.mockResolvedValue({ maxDomains: 1 });
      mockDb.domain.count.mockResolvedValue(1);

      const r = await LimitService.checkDomainLimit(1);
      expect(r.isLimitReached).toBe(true);
      expect(r.reason).toBe(LimitReason.DOMAIN);
    });

    it("allows when limit is -1 (unlimited)", async () => {
      mockPlan.getLimitsForTeam.mockResolvedValue({ maxDomains: -1 });
      mockDb.domain.count.mockResolvedValue(9999);

      const r = await LimitService.checkDomainLimit(1);
      expect(r.isLimitReached).toBe(false);
    });
  });

  describe("checkEmailLimit", () => {
    it("blocks when team is marked as blocked", async () => {
      mockTeamService.getTeamCached.mockResolvedValue({
        isBlocked: true,
        isActive: true,
        dailyEmailLimit: 100,
      });

      const r = await LimitService.checkEmailLimit(1);
      expect(r.isLimitReached).toBe(true);
      expect(r.reason).toBe(LimitReason.EMAIL_BLOCKED);
    });

    it("applies the plan's daily limit when available", async () => {
      mockTeamService.getTeamCached.mockResolvedValue({
        isBlocked: false,
        isActive: true,
        dailyEmailLimit: 10000,
      });
      mockPlan.getPlanForTeam.mockResolvedValue({
        key: "chispa",
        emailsPerDay: 50,
        emailsPerMonth: 1000,
      });
      mockUsage.mockResolvedValue({
        day: [{ sent: 60 }],
        month: [{ sent: 200 }],
      });

      const r = await LimitService.checkEmailLimit(1);
      expect(r.isLimitReached).toBe(true);
      expect(r.reason).toBe(LimitReason.EMAIL_DAILY_LIMIT_REACHED);
      expect(r.limit).toBe(50);
    });

    it("allows unlimited daily limit", async () => {
      mockTeamService.getTeamCached.mockResolvedValue({
        isBlocked: false,
        isActive: true,
        dailyEmailLimit: 0,
      });
      mockPlan.getPlanForTeam.mockResolvedValue({
        key: "orbita",
        emailsPerDay: -1,
        emailsPerMonth: -1,
      });
      mockUsage.mockResolvedValue({ day: [{ sent: 999999 }], month: [] });

      const r = await LimitService.checkEmailLimit(1);
      expect(r.isLimitReached).toBe(false);
    });

    it("applies monthly cap on FREE plan", async () => {
      mockTeamService.getTeamCached.mockResolvedValue({
        isBlocked: false,
        isActive: true,
        dailyEmailLimit: 100,
      });
      mockPlan.getPlanForTeam.mockResolvedValue({
        key: "free",
        emailsPerDay: 100,
        emailsPerMonth: 3000,
      });
      mockUsage.mockResolvedValue({
        day: [{ sent: 50 }],
        month: [{ sent: 3500 }],
      });

      const r = await LimitService.checkEmailLimit(1);
      expect(r.isLimitReached).toBe(true);
      expect(r.reason).toBe(LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED);
    });
  });
});
