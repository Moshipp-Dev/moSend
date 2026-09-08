"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCloud } from "~/utils/common";

type NavItem = { href: string; label: string; exact?: boolean };

// Sales first (what the operator uses every day), platform after.
const SALES: NavItem[] = [
  { href: "/admin/clients", label: "Clientes" },
  { href: "/admin/invoices", label: "Facturas" },
  { href: "/admin/activations", label: "Activaciones" },
  { href: "/admin/plans", label: "Planes" },
];

const PLATFORM: NavItem[] = [
  { href: "/admin/metrics", label: "Métricas" },
  { href: "/admin/gateways", label: "Pasarelas" },
  { href: "/admin", label: "SES", exact: true },
];

const CLOUD_ONLY: NavItem[] = [
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/teams-plans", label: "Teams y planes" },
  { href: "/admin/email-analytics", label: "Email analytics" },
  { href: "/admin/waitlist", label: "Waitlist" },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-lg font-bold">Administración</h1>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b pb-3">
          <NavGroup label="Ventas" items={SALES} />
          <NavGroup label="Plataforma" items={isCloud() ? [...PLATFORM, ...CLOUD_ONLY] : PLATFORM} />
        </nav>
      </div>
      <div>{children}</div>
    </div>
  );
}
