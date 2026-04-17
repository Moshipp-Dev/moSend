"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";

export default function ActivationPendingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = api.planActivation.getStatus.useQuery(
    { requestId: params.id },
    { refetchInterval: 15000 },
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Solicitud no encontrada</h1>
        <Link href="/pricing" className="text-primary hover:underline">
          Volver a planes
        </Link>
      </div>
    );
  }

  const content = {
    PENDING: {
      title: "Solicitud recibida",
      body: `Registramos tu interés por el plan ${data.planName}. Nuestro equipo confirmará tu pago y activará el plan en tu cuenta. Te notificaremos por correo cuando esté listo.`,
      tone: "default" as const,
    },
    APPROVED: {
      title: "¡Plan activado!",
      body: `Tu plan ${data.planName} ya está activo. Puedes comenzar a usar todas las funciones inmediatamente.`,
      tone: "success" as const,
    },
    REJECTED: {
      title: "Solicitud rechazada",
      body:
        data.rejectionReason ??
        "Tu solicitud fue rechazada. Contacta al equipo para más detalles.",
      tone: "error" as const,
    },
    CANCELLED: {
      title: "Solicitud cancelada",
      body: "Esta solicitud fue cancelada. Si cambiaste de opinión, puedes solicitar el plan nuevamente.",
      tone: "default" as const,
    },
  }[data.status];

  const toneClass = {
    default: "text-foreground",
    success: "text-green-700 dark:text-green-400",
    error: "text-destructive",
  }[content.tone];

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className={`text-3xl font-bold ${toneClass}`}>{content.title}</h1>
      <p className="text-muted-foreground">{content.body}</p>
      <div className="flex gap-3 text-sm">
        {data.status === "APPROVED" && (
          <Link
            href="/"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Ir al dashboard
          </Link>
        )}
        <Link
          href="/settings/billing"
          className="inline-flex items-center rounded-md border px-4 py-2 hover:bg-muted"
        >
          Ver mi facturación
        </Link>
        {(data.status === "REJECTED" || data.status === "CANCELLED") && (
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Ver planes
          </Link>
        )}
      </div>
    </div>
  );
}
