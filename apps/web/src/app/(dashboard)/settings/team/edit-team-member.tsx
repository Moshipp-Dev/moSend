"use client";

import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";

import { api } from "~/trpc/react";
import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@usesend/ui/src/toaster";
import { Role } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";

const teamUserSchema = z.object({
  role: z.enum(["MEMBER", "ADMIN", "CLIENT"]),
  domainIds: z.array(z.number()).optional(),
});

export const EditTeamMember: React.FC<{
  teamUser: { userId: string; role: Role; assignedDomainIds?: number[] };
}> = ({ teamUser }) => {
  const [open, setOpen] = useState(false);
  const updateTeamUserMutation = api.team.updateTeamUserRole.useMutation();
  const { data: domains } = api.domain.domains.useQuery();

  const utils = api.useUtils();

  const teamUserForm = useForm<z.infer<typeof teamUserSchema>>({
    resolver: zodResolver(teamUserSchema),
    defaultValues: {
      role: teamUser.role,
      domainIds: teamUser.assignedDomainIds ?? [],
    },
  });

  const selectedRole = teamUserForm.watch("role");

  async function onTeamUserUpdate(values: z.infer<typeof teamUserSchema>) {
    updateTeamUserMutation.mutate(
      {
        userId: teamUser.userId,
        role: values.role,
        domainIds: values.role === "CLIENT" ? (values.domainIds ?? []) : undefined,
      },
      {
        onSuccess: async () => {
          utils.team.getTeamUsers.invalidate();
          setOpen(false);
          toast.success("Rol del miembro actualizado exitosamente");
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <PencilIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar rol del miembro</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...teamUserForm}>
            <form
              onSubmit={teamUserForm.handleSubmit(onTeamUserUpdate)}
              className="space-y-8"
            >
              <FormField
                control={teamUserForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MEMBER">Miembro</SelectItem>
                        <SelectItem value="ADMIN">Administrador</SelectItem>
                        <SelectItem value="CLIENT">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {selectedRole === "CLIENT" && (
                <FormField
                  control={teamUserForm.control}
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
                            No hay dominios disponibles.
                          </p>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  isLoading={updateTeamUserMutation.isPending}
                  className="w-[150px]"
                >
                  Actualizar rol
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditTeamMember;
