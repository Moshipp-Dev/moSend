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

function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

// Underline tabs in one row. Sales tabs first, a thin divider, then the
// platform tabs; the divider is the only grouping cue so the bar never reads
// as two separate menus.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const platform = isCloud() ? [...PLATFORM, ...CLOUD_ONLY] : PLATFORM;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-lg font-bold">Administración</h1>
        <nav className="flex flex-wrap items-end border-b">
          <NavTabs items={SALES} />
          <span aria-hidden className="mx-2 mb-2 h-5 w-px self-center bg-border" />
          <NavTabs items={platform} />
        </nav>
      </div>
      <div>{children}</div>
    </div>
  );
}
