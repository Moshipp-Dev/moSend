"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { Domain } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";

export const DeleteDomain: React.FC<{ domain: Domain }> = ({ domain }) => {
  const deleteDomainMutation = api.domain.deleteDomain.useMutation();
  const utils = api.useUtils();
  const router = useRouter();

  const domainSchema = z
    .object({
      confirmation: z.string().min(1, "Por favor escribe el nombre del dominio para confirmar"),
    })
    .refine((data) => data.confirmation === domain.name, {
      message: "El nombre del dominio no coincide",
      path: ["confirmation"],
    });

  async function onDomainDelete(values: z.infer<typeof domainSchema>) {
    deleteDomainMutation.mutate(
      {
        id: domain.id,
      },
      {
        onSuccess: () => {
          utils.domain.domains.invalidate();
          toast.success(`Dominio ${domain.name} eliminado`);
          router.replace("/domains");
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Eliminar dominio"
      resourceName={domain.name}
      schema={domainSchema}
      isLoading={deleteDomainMutation.isPending}
      onConfirm={onDomainDelete}
      trigger={
        <Button variant="destructive" className="w-[150px]" size="sm">
          Eliminar dominio
        </Button>
      }
      confirmLabel="Eliminar dominio"
    />
  );
};

export default DeleteDomain;
