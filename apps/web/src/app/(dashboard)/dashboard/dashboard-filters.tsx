import React, { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@usesend/ui/src/tabs";
import { useUrlState } from "~/hooks/useUrlState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";
import { useTeam } from "~/providers/team-context";

interface DashboardFiltersProps {
  days: string;
  setDays: (days: string) => void;
  domain: string | null;
  setDomain: (domain: string | null) => void;
}

export default function DashboardFilters({
  days,
  setDays,
  domain,
  setDomain,
}: DashboardFiltersProps) {
  const { data: domainsQuery } = api.domain.domains.useQuery();
  const { currentIsClient } = useTeam();

  // For CLIENT: preselect first domain if none selected
  useEffect(() => {
    if (currentIsClient && !domain && domainsQuery && domainsQuery.length > 0) {
      setDomain(domainsQuery[0]!.id.toString());
    }
  }, [currentIsClient, domain, domainsQuery, setDomain]);

  const handleDomain = (val: string) => {
    setDomain(val === "todos" ? null : val);
  };

  const selectedDomainName = domain
    ? domainsQuery?.find((d) => d.id === Number(domain))?.name
    : "Todos los dominios";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select
        value={domain ?? "todos"}
        onValueChange={(val) => handleDomain(val)}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          {selectedDomainName}
        </SelectTrigger>
        <SelectContent>
          {!currentIsClient && (
            <SelectItem value="todos">Todos los dominios</SelectItem>
          )}
          {domainsQuery &&
            domainsQuery.map((domain) => (
              <SelectItem key={domain.id} value={domain.id.toString()}>
                {domain.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Tabs value={days || "30"} onValueChange={(value) => setDays(value)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="7" className="flex-1 sm:flex-none">
            7 días
          </TabsTrigger>
          <TabsTrigger value="30" className="flex-1 sm:flex-none">
            30 días
          </TabsTrigger>
          <TabsTrigger value="60" className="flex-1 sm:flex-none">
            60 días
          </TabsTrigger>
          <TabsTrigger value="90" className="flex-1 sm:flex-none">
            90 días
          </TabsTrigger>
          <TabsTrigger value="180" className="flex-1 sm:flex-none">
            180 días
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
