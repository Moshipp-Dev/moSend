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
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@usesend/ui/src/toaster";
import { useRouter } from "next/navigation";
import Spinner from "@usesend/ui/src/spinner";

const campaignSchema = z.object({
  name: z.string({ required_error: "El nombre es obligatorio" }).min(1, {
    message: "El nombre es obligatorio",
  }),
  from: z.string({ required_error: "El email de origen es obligatorio" }).min(1, {
    message: "El email de origen es obligatorio",
  }),
  subject: z.string({ required_error: "El asunto es obligatorio" }).min(1, {
    message: "El asunto es obligatorio",
  }),
});

export default function CreateCampaign() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const createCampaignMutation = api.campaign.createCampaign.useMutation();

  const campaignForm = useForm<z.infer<typeof campaignSchema>>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      from: "",
      subject: "",
    },
  });

  const utils = api.useUtils();

  async function onCampaignCreate(values: z.infer<typeof campaignSchema>) {
    createCampaignMutation.mutate(
      {
        name: values.name,
        from: values.from,
        subject: values.subject,
      },
      {
        onSuccess: async (data) => {
          utils.campaign.getCampaigns.invalidate();
          router.push(`/campaigns/${data.id}/edit`);
          toast.success("Campaña creada exitosamente");
          setOpen(false);
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
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Crear campaña
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear nueva campaña</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...campaignForm}>
            <form
              onSubmit={campaignForm.handleSubmit(onCampaignCreate)}
              className="space-y-8"
            >
              <FormField
                control={campaignForm.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre de la campaña" {...field} />
                    </FormControl>
                    {formState.errors.name ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <FormField
                control={campaignForm.control}
                name="from"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Remitente</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Friendly Name <from@example.com>"
                        {...field}
                      />
                    </FormControl>
                    {formState.errors.from ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <FormField
                control={campaignForm.control}
                name="subject"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Asunto</FormLabel>
                    <FormControl>
                      <Input placeholder="Asunto de la campaña" {...field} />
                    </FormControl>
                    {formState.errors.subject ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <p className="text-muted-foreground text-sm">
                No te preocupes, puedes cambiarlo más tarde.
              </p>
              <div className="flex justify-end">
                <Button
                  className=" w-[100px]"
                  type="submit"
                  disabled={createCampaignMutation.isPending}
                >
                  {createCampaignMutation.isPending ? (
                    <Spinner className="w-4 h-4" />
                  ) : (
                    "Crear"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
