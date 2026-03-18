"use client";

import { useEffect } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Input } from "@usesend/ui/src/input";
import { Button } from "@usesend/ui/src/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";

const editApiKeySchema = z.object({
  name: z
    .string({ required_error: "El nombre es requerido" })
    .min(1, { message: "El nombre es requerido" }),
  domainId: z.string().optional(),
});

type EditApiKeyFormValues = z.infer<typeof editApiKeySchema>;

interface ApiKeyData {
  id: number;
  name: string;
  domainId: number | null;
  domain?: { name: string } | null;
}

export function EditApiKeyDialog({
  apiKey,
  open,
  onOpenChange,
}: {
  apiKey: ApiKeyData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateApiKey = api.apiKey.updateApiKey.useMutation();
  const domainsQuery = api.domain.domains.useQuery();
  const utils = api.useUtils();

  const form = useForm<EditApiKeyFormValues>({
    resolver: zodResolver(editApiKeySchema),
    defaultValues: {
      name: apiKey.name,
      domainId: apiKey.domainId ? apiKey.domainId.toString() : "all",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: apiKey.name,
        domainId: apiKey.domainId ? apiKey.domainId.toString() : "all",
      });
    }
  }, [open, apiKey, form]);

  function handleSubmit(values: EditApiKeyFormValues) {
    const domainId =
      values.domainId === "all" ? null : Number(values.domainId);

    updateApiKey.mutate(
      {
        id: apiKey.id,
        name: values.name,
        domainId,
      },
      {
        onSuccess: () => {
          utils.apiKey.invalidate();
          toast.success("Clave API actualizada");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar clave API</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-8"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Nombre de la clave API</FormLabel>
                    <FormControl>
                      <Input placeholder="clave producción" {...field} />
                    </FormControl>
                    {formState.errors.name ? (
                      <FormMessage />
                    ) : (
                      <FormDescription>
                        Usa un nombre para identificar fácilmente esta clave API.
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="domainId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Acceso a dominio</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar acceso a dominio" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">Todos los dominios</SelectItem>
                        {domainsQuery.data?.map(
                          (domain: { id: number; name: string }) => (
                            <SelectItem
                              key={domain.id}
                              value={domain.id.toString()}
                            >
                              {domain.name}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Elige desde qué dominio puede enviar correos esta clave API.
                    </FormDescription>
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  className="w-[120px] hover:bg-gray-100 focus:bg-gray-100"
                  type="submit"
                  disabled={updateApiKey.isPending}
                >
                  {updateApiKey.isPending ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
