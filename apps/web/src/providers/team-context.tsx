"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { api } from "~/trpc/react";

// Define the Team type based on the Prisma schema
type Team = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  plan: "FREE" | "BASIC";
  stripeCustomerId?: string | null;
  billingEmail?: string | null;
};

interface TeamContextType {
  currentTeam: Team | null;
  teams: Team[];
  isLoading: boolean;
  currentRole: "ADMIN" | "MEMBER" | "CLIENT";
  currentIsAdmin: boolean;
  currentIsClient: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { data: teams, status } = api.team.getTeams.useQuery();

  const currentTeam = teams?.[0] ?? null;

  const currentRole = currentTeam?.teamUsers[0]?.role ?? "MEMBER";

  const value = {
    currentTeam,
    teams: teams || [],
    isLoading: status === "pending",
    currentRole,
    currentIsAdmin: currentRole === "ADMIN",
    currentIsClient: currentRole === "CLIENT",
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error("useTeam must be used within a TeamProvider");
  }
  return context;
}
