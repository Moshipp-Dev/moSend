"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { Input } from "@usesend/ui/src/input";
import { useForm } from "react-hook-form";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { useTeam } from "~/providers/team-context";
import { isCloud, isSelfHosted } from "~/utils/common";
import { useUpgradeModalStore } from "~/store/upgradeModalStore";
import { LimitReason } from "~/lib/constants/plans";

const inviteTeamMemberSchema = z.object({
  email: z
    .string({ required_error: "El correo es requerido" })
    .email("Dirección de correo inválida"),
  role: z.enum(["ADMIN", "MEMBER", "CLIENT"], {
    required_error: "Por favor selecciona un rol",
  }),
  domainIds: z.array(z.number()).optional(),
});

type FormData = z.infer<typeof inviteTeamMemberSchema>;

export default function InviteTeamMember() {
  const { currentIsAdmin } = useTeam();
  const { data: domains } = api.domain.domains.useQuery();

  const limitsQuery = api.limits.get.useQuery({
    type: LimitReason.TEAM_MEMBER,
  });
  const { openModal } = useUpgradeModalStore((s) => s.action);

  const [open, setOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(inviteTeamMemberSchema),
    defaultValues: {
      email: "",
      role: "MEMBER",
      domainIds: [],
    },
  });

  const selectedRole = form.watch("role");
  const selectedDomainIds = form.watch("domainIds") ?? [];

  const utils = api.useUtils();

  const createInvite = api.team.createTeamInvite.useMutation();

  function onSubmit(values: FormData) {
    if (limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    createInvite.mutate(
      {
        email: values.email,
        role: values.role,
        sendEmail: true,
        domainIds: values.role === "CLIENT" ? (values.domainIds ?? []) : undefined,
      },
      {
        onSuccess: () => {
          form.reset();
          setOpen(false);
          void utils.team.getTeamInvites.invalidate();
          toast.success("Invitación enviada exitosamente");
        },
        onError: (error) => {
          console.error(error);
          toast.error(error.message || "No se pudo enviar la invitación");
        },
      },
    );
  }

  async function onCopyLink() {
    if (limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    createInvite.mutate(
      {
        email: form.getValues("email"),
        role: form.getValues("role"),
        sendEmail: false,
        domainIds: form.getValues("role") === "CLIENT" ? (form.getValues("domainIds") ?? []) : undefined,
      },
      {
        onSuccess: (invite) => {
          void utils.team.getTeamInvites.invalidate();
          navigator.clipboard.writeText(
            `${location.origin}/join-team?inviteId=${invite.id}`,
          );
          form.reset();
          setOpen(false);
          toast.success("Enlace de invitación copiado al portapapeles");
        },
        onError: (error) => {
          console.error(error);
          toast.error(error.message || "No se pudo copiar el enlace de invitación");
        },
      },
    );
  }

  function onOpenChange(_open: boolean) {
    if (_open && limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    setOpen(_open);
  }

  if (!currentIsAdmin) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? onOpenChange(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="mr-2 h-4 w-4" />
          Invitar miembro
        </Button>
      </DialogTrigger>
      <DialogContent className=" max-w-lg">
        <DialogHeader>
          <DialogTitle>Invitar miembro al equipo</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 pt-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field, formState }) => (
                <FormItem>
                  <FormLabel>Correo electrónico</FormLabel>
                  <FormControl>
                    <Input placeholder="colega@ejemplo.com" {...field} />
                  </FormControl>
                  {formState.errors.email ? (
                    <FormMessage />
                  ) : (
                    <FormDescription>
                      Ingresa la dirección de correo de tu colega
                    </FormDescription>
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <div className="capitalize">
                          {field.value.toLowerCase()}
                        </div>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ADMIN">
                        <div>Administrador</div>
                        <div className="text-xs text-muted-foreground">
                          Gestionar usuarios, actualizar pagos
                        </div>
                      </SelectItem>
                      <SelectItem value="MEMBER">
                        <div>Miembro</div>
                        <div className="text-xs text-muted-foreground">
                          Gestionar correos, dominios y contactos
                        </div>
                      </SelectItem>
                      <SelectItem value="CLIENT">
                        <div>Cliente</div>
                        <div className="text-xs text-muted-foreground">
                          Ver y gestionar solo los dominios asignados
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedRole === "CLIENT" && (
              <FormField
                control={form.control}
                name="domainIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dominios asignados</FormLabel>
                    <div className="flex flex-col gap-2 rounded-md border p-3">
                      {domains && domains.length > 0 ? (
                        domains.map((domain) => {
                          const checked = (field.value ?? []).includes(domain.id);
                          return (
                            <label
                              key={domain.id}
                              className="flex items-center gap-2 cursor-pointer text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const current = field.value ?? [];
                                  field.onChange(
                                    checked
                                      ? current.filter((id) => id !== domain.id)
                                      : [...current, domain.id]
                                  );
                                }}
                                className="h-4 w-4 rounded border"
                              />
                              {domain.name}
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No hay dominios disponibles. Agrega un dominio primero.
                        </p>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {isSelfHosted() && domains?.length && selectedRole !== "CLIENT" ? (
              <div className="text-sm text-muted-foreground">
                Will use{" "}
                <span className="font-bold">hello@{domains[0]?.name}</span> to
                send invitation
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              {isSelfHosted() ? (
                <Button
                  disabled={createInvite.isPending || limitsQuery.isLoading}
                  isLoading={createInvite.isPending}
                  className="w-[150px]"
                  onClick={form.handleSubmit(onCopyLink)}
                >
                  Copiar invitación
                </Button>
              ) : null}
              {isCloud() || domains?.length ? (
                <Button
                  type="submit"
                  disabled={createInvite.isPending || limitsQuery.isLoading}
                  isLoading={createInvite.isPending}
                  className="w-[150px]"
                >
                  Enviar invitación
                </Button>
              ) : null}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
