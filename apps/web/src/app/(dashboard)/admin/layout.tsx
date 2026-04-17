"use client";

import { SettingsNavButton } from "../dev-settings/settings-nav-button";
import { isCloud } from "~/utils/common";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-lg font-bold">Admin</h1>
      <div className="mt-4 flex flex-wrap gap-4">
        <SettingsNavButton href="/admin/metrics">
          Métricas
        </SettingsNavButton>
        <SettingsNavButton href="/admin/activations">
          Activaciones
        </SettingsNavButton>
        <SettingsNavButton href="/admin/plans">
          Planes
        </SettingsNavButton>
        <SettingsNavButton href="/admin/gateways">
          Pasarelas
        </SettingsNavButton>
        <SettingsNavButton href="/admin">
          SES
        </SettingsNavButton>
        {isCloud() ? (
          <SettingsNavButton href="/admin/teams">
            Teams
          </SettingsNavButton>
        ) : null}
        {isCloud() ? (
          <SettingsNavButton href="/admin/teams-plans">
            Teams &amp; Planes
          </SettingsNavButton>
        ) : null}
        {isCloud() ? (
          <SettingsNavButton href="/admin/email-analytics">
            Email analytics
          </SettingsNavButton>
        ) : null}
        {isCloud() ? (
          <SettingsNavButton href="/admin/waitlist">
            Waitlist
          </SettingsNavButton>
        ) : null}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
