import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@usesend/ui/src/tabs";
import { useUrlState } from "~/hooks/useUrlState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";

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

  const handleDomain = (val: string) => {
    setDomain(val === "todos" ? null : val);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select
        value={domain ?? "todos"}
        onValueChange={(val) => handleDomain(val)}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          {domain
            ? domainsQuery?.find((d) => d.id === Number(domain))?.name
            : "Todos los dominios"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los dominios</SelectItem>
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
