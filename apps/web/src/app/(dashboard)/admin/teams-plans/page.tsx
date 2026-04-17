"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";

export default function AdminTeamsPlansPage() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [planFilter, setPlanFilter] = useState<string>("all");

  const { data: plans } = api.adminPlans.list.useQuery();
  const { data, isLoading } = api.adminTeams.list.useQuery({
    search: search || undefined,
    planId: planFilter === "all" ? undefined : Number(planFilter),
    page,
    pageSize: 25,
  });

  const assignMutation = api.adminTeams.assignPlan.useMutation({
    onSuccess: async () => {
      toast.success("Plan asignado");
      await utils.adminTeams.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleBlockMutation = api.adminTeams.toggleBlock.useMutation({
    onSuccess: async () => {
      toast.success("Estado actualizado");
      await utils.adminTeams.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Teams &amp; Planes</h2>

      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nombre o email de billing"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <Select
          value={planFilter}
          onValueChange={(v) => {
            setPlanFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
            {plans?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-2">ID</th>
                <th className="py-2">Nombre</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Bloqueado</th>
                <th className="py-2">Miembros / Dominios</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data?.teams.map((team) => (
                <tr key={team.id} className="border-t">
                  <td className="py-2">{team.id}</td>
                  <td className="py-2 font-medium">{team.name}</td>
                  <td className="py-2">
                    <Select
                      value={
                        team.pricingPlanId ? String(team.pricingPlanId) : ""
                      }
                      onValueChange={(v) =>
                        assignMutation.mutate({
                          teamId: team.id,
                          planId: Number(v),
                        })
                      }
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue
                          placeholder={team.pricingPlan?.name ?? "Sin plan"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {plans?.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2">
                    {team.isBlocked ? (
                      <span className="text-destructive">Sí</span>
                    ) : (
                      "No"
                    )}
                  </td>
                  <td className="py-2 text-xs">
                    {team._count.teamUsers} · {team._count.domains}
                  </td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant={team.isBlocked ? "outline" : "destructive"}
                      onClick={() =>
                        toggleBlockMutation.mutate({
                          teamId: team.id,
                          isBlocked: !team.isBlocked,
                        })
                      }
                    >
                      {team.isBlocked ? "Desbloquear" : "Bloquear"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Total: {data?.total ?? 0}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !data || page * data.pageSize >= data.total
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
