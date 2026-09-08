"use client";

import { useSession } from "next-auth/react";
import { FullScreenLoading } from "~/components/FullScreenLoading";
import { AddSesSettings } from "~/components/settings/AddSesSettings";
import CreateTeam from "~/components/team/CreateTeam";
import { env } from "~/env";
import { api } from "~/trpc/react";
import { TeamProvider } from "./team-context";

export const DashboardProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data: session } = useSession();
  const { data: teams, status } = api.team.getTeams.useQuery();

  // Only operators may read SES settings (adminProcedure): platform admins,
  // or team ADMINs on a self-hosted install. CLIENT and MEMBER users must not
  // even ask, otherwise the unauthorized query keeps the dashboard on the
  // loading screen while it retries.
  const currentRole = teams?.[0]?.teamUsers[0]?.role;
  const isOperator =
    Boolean(session?.user.isAdmin) ||
    (!env.NEXT_PUBLIC_IS_CLOUD && currentRole === "ADMIN");

  const { data: settings, status: settingsStatus } =
    api.admin.getSesSettings.useQuery(undefined, {
      enabled: status === "success" && isOperator,
      retry: false,
    });

  if (status === "pending" || (isOperator && settingsStatus === "pending")) {
    return <FullScreenLoading />;
  }

  if (isOperator && settings?.length === 0) {
    return <AddSesSettings />;
  }

  if (!teams || teams.length === 0) {
    return <CreateTeam />;
  }

  return <TeamProvider>{children}</TeamProvider>;
};
