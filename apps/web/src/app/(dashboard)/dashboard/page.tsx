"use client";

import EmailChart from "./email-chart";
import DashboardFilters from "./dashboard-filters";
import { H1 } from "@usesend/ui";
import { useUrlState } from "~/hooks/useUrlState";
import { ReputationMetrics } from "./reputation-metrics";
import { subDays } from "date-fns";

export default function Dashboard() {
  const [days, setDays] = useUrlState("days", "30");
  const [domain, setDomain] = useUrlState("domain");
  const [dateFrom, setDateFrom] = useUrlState("dateFrom");
  const [dateTo, setDateTo] = useUrlState("dateTo");

  const isCustom = !!dateFrom && !!dateTo;
  const effectiveDateFrom = isCustom
    ? dateFrom
    : (subDays(new Date(), Number(days ?? 30)).toISOString().split("T")[0] as string);
  const effectiveDateTo = isCustom
    ? dateTo
    : (new Date().toISOString().split("T")[0] as string);

  return (
    <div>
      <div className="w-full">
        <div className="flex justify-between items-center mb-10">
          <H1>Analíticas</H1>
          <DashboardFilters
            days={days ?? "30"}
            setDays={setDays}
            domain={domain}
            setDomain={setDomain}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
          />
        </div>
        <div className=" space-y-12">
          <EmailChart
            dateFrom={effectiveDateFrom}
            dateTo={effectiveDateTo}
            domain={domain}
          />
          <ReputationMetrics domain={domain} />
        </div>
      </div>
    </div>
  );
}
