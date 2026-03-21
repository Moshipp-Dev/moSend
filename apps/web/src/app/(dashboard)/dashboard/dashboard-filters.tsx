import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@usesend/ui/src/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { Calendar } from "@usesend/ui/src/calendar";
import { api } from "~/trpc/react";
import { useTeam } from "~/providers/team-context";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

interface DashboardFiltersProps {
  days: string;
  setDays: (days: string) => void;
  domain: string | null;
  setDomain: (domain: string | null) => void;
  dateFrom: string | null;
  setDateFrom: (d: string | null) => void;
  dateTo: string | null;
  setDateTo: (d: string | null) => void;
}

export default function DashboardFilters({
  days,
  setDays,
  domain,
  setDomain,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: DashboardFiltersProps) {
  const { data: domainsQuery } = api.domain.domains.useQuery();
  const { currentIsClient } = useTeam();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isCustom = !!dateFrom && !!dateTo;

  // For CLIENT: preselect first domain if none selected
  useEffect(() => {
    if (currentIsClient && !domain && domainsQuery && domainsQuery.length > 0) {
      setDomain(domainsQuery[0]!.id.toString());
    }
  }, [currentIsClient, domain, domainsQuery, setDomain]);

  const handleDomain = (val: string) => {
    setDomain(val === "todos" ? null : val);
  };

  const handleTabChange = (value: string) => {
    if (value !== "custom") {
      setDays(value);
      setDateFrom(null);
      setDateTo(null);
    }
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setDateFrom(range.from.toISOString().split("T")[0]!);
      setDateTo(range.to.toISOString().split("T")[0]!);
      setCalendarOpen(false);
    }
  };

  const selectedRange: DateRange | undefined =
    dateFrom && dateTo
      ? { from: new Date(dateFrom + "T00:00:00"), to: new Date(dateTo + "T00:00:00") }
      : undefined;

  const customLabel =
    isCustom && dateFrom && dateTo
      ? `${format(new Date(dateFrom + "T00:00:00"), "MMM dd")} - ${format(new Date(dateTo + "T00:00:00"), "MMM dd")}`
      : "Personalizado";

  const selectedDomainName = domain
    ? domainsQuery?.find((d) => d.id === Number(domain))?.name
    : "Todos los dominios";

  const tabValue = isCustom ? "custom" : days || "30";

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
      <Tabs value={tabValue} onValueChange={handleTabChange}>
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
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <TabsTrigger value="custom" className="flex-1 sm:flex-none">
                {customLabel}
              </TabsTrigger>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={selectedRange}
                onSelect={handleRangeSelect}
                disabled={{ after: new Date() }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </TabsList>
      </Tabs>
    </div>
  );
}
