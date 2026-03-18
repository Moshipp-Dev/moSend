"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import { Label } from "@usesend/ui/src/label";
import { Switch } from "@usesend/ui/src/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";
import { isCloud } from "~/utils/common";
import { timeframeOptions } from "./constants";
import { keepPreviousData } from "@tanstack/react-query";

export default function AdminEmailAnalyticsPage() {
  const isCloudEnv = isCloud();
  const [timeframe, setTimeframe] =
    useState<(typeof timeframeOptions)[number]["value"]>("today");
  const [paidOnly, setPaidOnly] = useState(false);

  const analyticsQuery = api.admin.getEmailAnalytics.useQuery(
    {
      timeframe,
      paidOnly,
    },
    { enabled: isCloudEnv, placeholderData: keepPreviousData }
  );

  const data = analyticsQuery.data;

  const totals = data?.totals ?? {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    hardBounced: 0,
  };

  const rows = useMemo(() => data?.rows ?? [], [data]);

  if (!isCloudEnv) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
        Las analíticas de correo están disponibles solo en el despliegue en la nube.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Analíticas de correo</h2>
      <div className="flex flex-wrap gap-4">
        <div className="w-48">
          <Label htmlFor="timeframe">Período</Label>
          <Select
            value={timeframe}
            onValueChange={(value) =>
              setTimeframe(value as (typeof timeframeOptions)[number]["value"])
            }
          >
            <SelectTrigger id="timeframe">
              <SelectValue placeholder="Seleccionar período" />
            </SelectTrigger>
            <SelectContent>
              {timeframeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-3">
          <Switch checked={paidOnly} onCheckedChange={setPaidOnly} id="paid" />
          <Label htmlFor="paid">Solo usuarios de pago</Label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Enviados" value={totals.sent} />
        <SummaryCard label="Entregados" value={totals.delivered} />
        <SummaryCard label="Abiertos" value={totals.opened} />
        <SummaryCard label="Clics" value={totals.clicked} />
        <SummaryCard label="Rebotados" value={totals.bounced} />
        <SummaryCard label="Reclamados" value={totals.complained} />
        <SummaryCard label="Rebote duro" value={totals.hardBounced} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Uso por equipo</CardTitle>
            {data ? (
              <p className="text-sm text-muted-foreground">
                Desde {data.timeframe === "today" ? "hoy" : data.periodStart}
              </p>
            ) : null}
          </div>
          {analyticsQuery.isLoading ? <Spinner className="h-4 w-4" /> : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipo</TableHead>
                <TableHead>ID de equipo</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Enviados</TableHead>
                <TableHead className="text-right">Entregados</TableHead>
                <TableHead className="text-right">Abiertos</TableHead>
                <TableHead className="text-right">Clics</TableHead>
                <TableHead className="text-right">Rebotados</TableHead>
                <TableHead className="text-right">Reclamados</TableHead>
                <TableHead className="text-right">Rebote duro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analyticsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center">
                    <Spinner className="h-6 w-6" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center">
                    No se encontró actividad de correo para este período.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.teamId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.teamId}</TableCell>
                    <TableCell>{row.plan}</TableCell>
                    <TableCell className="text-right">{row.sent}</TableCell>
                    <TableCell className="text-right">
                      {row.delivered}
                    </TableCell>
                    <TableCell className="text-right">{row.opened}</TableCell>
                    <TableCell className="text-right">{row.clicked}</TableCell>
                    <TableCell className="text-right">{row.bounced}</TableCell>
                    <TableCell className="text-right">
                      {row.complained}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.hardBounced}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
