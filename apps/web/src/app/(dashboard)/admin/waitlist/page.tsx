"use client";

import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@usesend/ui/src/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Input } from "@usesend/ui/src/input";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { Switch } from "@usesend/ui/src/switch";
import { Badge } from "@usesend/ui/src/badge";
import { formatDistanceToNow } from "date-fns";

import { api } from "~/trpc/react";
import { isCloud } from "~/utils/common";
import type { AppRouter } from "~/server/api/root";
import type { inferRouterOutputs } from "@trpc/server";

const searchSchema = z.object({
  email: z
    .string({ required_error: "El correo es obligatorio" })
    .trim()
    .email("Ingresa una dirección de correo válida"),
});

type SearchInput = z.infer<typeof searchSchema>;

type RouterOutputs = inferRouterOutputs<AppRouter>;
type WaitlistUser = NonNullable<RouterOutputs["admin"]["findUserByEmail"]>;

export default function AdminWaitlistPage() {
  const [userResult, setUserResult] = useState<WaitlistUser | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const form = useForm<SearchInput>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      email: "",
    },
  });

  const findUser = api.admin.findUserByEmail.useMutation({
    onSuccess: (data) => {
      setHasSearched(true);
      if (!data) {
        setUserResult(null);
        toast.info("No se encontró ningún usuario con ese correo");
        return;
      }

      setUserResult(data);
    },
    onError: (error) => {
      toast.error(error.message ?? "No se pudo buscar el usuario");
    },
  });

  const updateWaitlist = api.admin.updateUserWaitlist.useMutation({
    onSuccess: (updated) => {
      setUserResult(updated);
      toast.success(
        updated.isWaitlisted
          ? "Usuario marcado en lista de espera"
          : "Usuario eliminado de la lista de espera",
      );
    },
    onError: (error) => {
      toast.error(error.message ?? "No se pudo actualizar el estado de lista de espera");
    },
  });

  const rejectWaitlist = api.admin.rejectWaitlistUser.useMutation({
    onSuccess: () => {
      toast.success("Correo de rechazo enviado");
    },
    onError: (error) => {
      toast.error(error.message ?? "No se pudo enviar el correo de rechazo");
    },
  });

  const onSubmit = (values: SearchInput) => {
    setHasSearched(false);
    setUserResult(null);
    findUser.mutate(values);
  };

  const handleToggle = (checked: boolean) => {
    if (!userResult) return;
    updateWaitlist.mutate({ userId: userResult.id, isWaitlisted: checked });
  };

  const handleReject = () => {
    if (!userResult) return;
    rejectWaitlist.mutate({ userId: userResult.id });
  };

  if (!isCloud()) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
        Las herramientas de lista de espera están disponibles solo en el despliegue en la nube.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-6 shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo del usuario</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="user@example.com"
                      autoComplete="off"
                      {...field}
                      value={field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={findUser.isPending}>
              {findUser.isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Buscando...
                </>
              ) : (
                "Buscar usuario"
              )}
            </Button>
          </form>
        </Form>
      </div>

      {findUser.isPending ? null : hasSearched && !userResult ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Ningún usuario coincide con ese correo. Intenta de nuevo.
        </div>
      ) : null}

      {userResult ? (
        <div className="space-y-4 rounded-lg border p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Correo</p>
              <p className="text-base font-medium">{userResult.email}</p>
            </div>
            <Badge variant={userResult.isWaitlisted ? "destructive" : "outline"}>
              {userResult.isWaitlisted ? "En lista de espera" : "Activo"}
            </Badge>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Nombre</p>
              <p>{userResult.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Registrado</p>
              <p>
                {formatDistanceToNow(new Date(userResult.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Acceso a lista de espera</p>
                <p className="text-sm text-muted-foreground">
                  Activa o desactiva para controlar si el usuario permanece en la lista de espera.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={userResult.isWaitlisted}
                  onCheckedChange={handleToggle}
                  disabled={updateWaitlist.isPending}
                />
                {updateWaitlist.isPending ? (
                  <Spinner className="h-4 w-4" />
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Rechazar solicitud de lista de espera</p>
                <p className="text-sm text-muted-foreground">
                  Envía al solicitante un correo de rechazo sin cambiar su estado en la lista de espera.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={handleReject}
                disabled={rejectWaitlist.isPending}
              >
                {rejectWaitlist.isPending ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" /> Enviando...
                  </>
                ) : (
                  "Enviar correo de rechazo"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
