"use client";

import { H1 } from "@usesend/ui";
import { SettingsNavButton } from "./settings-nav-button";
import { useTeam } from "~/providers/team-context";

export const dynamic = "force-static";

export default function ApiKeysPage({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentIsClient } = useTeam();

  return (
    <div>
      <H1>Developer</H1>
      <div className="flex gap-4 mt-4">
        <SettingsNavButton href="/dev-settings">API Keys</SettingsNavButton>
        {!currentIsClient && (
          <SettingsNavButton href="/dev-settings/smtp">SMTP</SettingsNavButton>
        )}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
