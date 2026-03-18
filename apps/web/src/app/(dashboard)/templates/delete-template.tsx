"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { Template } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";
import { z } from "zod";

export const DeleteTemplate: React.FC<{
  template: Partial<Template> & { id: string };
}> = ({ template }) => {
  const deleteTemplateMutation = api.template.deleteTemplate.useMutation();
  const utils = api.useUtils();

  const templateSchema = z
    .object({
      confirmation: z
        .string()
        .min(1, "Por favor, escribe el nombre de la plantilla para confirmar"),
    })
    .refine((data) => data.confirmation === template.name, {
      message: "El nombre de la plantilla no coincide",
      path: ["confirmation"],
    });

  async function onTemplateDelete(values: z.infer<typeof templateSchema>) {
    deleteTemplateMutation.mutate(
      {
        templateId: template.id,
      },
      {
        onSuccess: () => {
          utils.template.getTemplates.invalidate();
          toast.success(`Plantilla eliminada`);
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Eliminar plantilla"
      resourceName={template.name || ""}
      schema={templateSchema}
      isLoading={deleteTemplateMutation.isPending}
      onConfirm={onTemplateDelete}
      trigger={
        <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent">
          <Trash2 className="h-[18px] w-[18px] text-red/80" />
        </Button>
      }
      confirmLabel="Eliminar plantilla"
    />
  );
};

export default DeleteTemplate;
