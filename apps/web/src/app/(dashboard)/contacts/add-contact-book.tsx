"use client";

import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";

import { api } from "~/trpc/react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
import { useForm } from "react-hook-form";
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
import { useUpgradeModalStore } from "~/store/upgradeModalStore";
import { LimitReason } from "~/lib/constants/plans";

const contactBookSchema = z.object({
  name: z.string({ required_error: "El nombre es obligatorio" }).min(1, {
    message: "El nombre es obligatorio",
  }),
  variables: z.string().optional(),
});

export default function AddContactBook() {
  const [open, setOpen] = useState(false);
  const createContactBookMutation =
    api.contacts.createContactBook.useMutation();

  const limitsQuery = api.limits.get.useQuery({
    type: LimitReason.CONTACT_BOOK,
  });
  const { openModal } = useUpgradeModalStore((s) => s.action);

  const utils = api.useUtils();

  const contactBookForm = useForm<z.infer<typeof contactBookSchema>>({
    resolver: zodResolver(contactBookSchema),
    defaultValues: {
      name: "",
      variables: "",
    },
  });

  function handleSave(values: z.infer<typeof contactBookSchema>) {
    if (limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    createContactBookMutation.mutate(
      {
        name: values.name,
        variables: values.variables
          ?.split(",")
          .map((variable) => variable.trim())
          .filter(Boolean),
      },
      {
        onSuccess: () => {
          utils.contacts.getContactBooks.invalidate();
          contactBookForm.reset();
          setOpen(false);
          toast.success("Libreta de contactos creada exitosamente");
        },
        onError: (error) => {
          toast.error(error.message);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? onOpenChange(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Agregar libreta
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear una nueva libreta de contactos</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...contactBookForm}>
            <form
              onSubmit={contactBookForm.handleSubmit(handleSave)}
              className="space-y-8"
            >
              <FormField
                control={contactBookForm.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Nombre de la libreta</FormLabel>
                    <FormControl>
                      <Input placeholder="Mis contactos" {...field} />
                    </FormControl>
                    {formState.errors.name ? (
                      <FormMessage />
                    ) : (
                      <FormDescription>
                        ej: producto / sitio web / nombre del boletín
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={contactBookForm.control}
                name="variables"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variables</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="registrationCode, company, plan"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Nombres de variables separados por coma para la
                      personalización de campañas (opcional).
                    </FormDescription>
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  className=" w-[100px]"
                  type="submit"
                  disabled={
                    createContactBookMutation.isPending || limitsQuery.isLoading
                  }
                >
                  {createContactBookMutation.isPending
                    ? "Creando..."
                    : "Crear"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
