"use client";

import DomainsList from "./domain-list";
import AddDomain from "./add-domain";
import { H1 } from "@usesend/ui";
import { useTeam } from "~/providers/team-context";

export default function DomainsPage() {
  const { currentIsClient } = useTeam();

  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Dominios</H1>
        {!currentIsClient && <AddDomain />}
      </div>
      <DomainsList />
    </div>
  );
}
