"use client";

import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { H1 } from "@usesend/ui";

export default function PaymentsPage() {
  const searchParams = useSearchParams();

  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  return (
    <div className="container mx-auto py-10">
      <H1>Pago {success ? "exitoso" : canceled ? "cancelado" : "desconocido"}</H1>
      {canceled ? (
        <Link href="/settings/billing">
          <Button>Ir a facturación</Button>
        </Link>
      ) : null}
      {success ? <VerifySuccess /> : null}
    </div>
  );
}

function VerifySuccess() {
  const { data: teams, isLoading } = api.team.getTeams.useQuery(undefined, {
    refetchInterval: 3000,
  });

  if (teams?.[0]?.plan !== "FREE") {
    return (
      <div>
        <div className="flex gap-2 items-center">
          <CheckCircle2 className="h-4 w-4 text-green flex-shrink-0" />
          <p>Tu cuenta ha sido actualizada al plan de pago.</p>
        </div>
        <Link href="/settings/billing" className="mt-8">
          <Button className="mt-8">Ir a facturación</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <Spinner
        className="h-5 w-5 stroke-muted-foreground"
        innerSvgClass=" stroke-muted-foreground"
      />
      <p className="text-muted-foreground">Verificando pago</p>
    </div>
  );
}
