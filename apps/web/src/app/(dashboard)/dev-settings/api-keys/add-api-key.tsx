"use client";

import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";

import { api } from "~/trpc/react";
import { useState } from "react";
import { CheckIcon, ClipboardCopy, Eye, EyeOff, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";

const apiKeySchema = z.object({
  name: z.string({ required_error: "El nombre es requerido" }).min(1, {
    message: "El nombre es requerido",
  }),
  domainId: z.string().optional(),
});

export default function AddApiKey() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const createApiKeyMutation = api.apiKey.createToken.useMutation();
  const [isCopied, setIsCopied] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const domainsQuery = api.domain.domains.useQuery();

  const utils = api.useUtils();

  const apiKeyForm = useForm<z.infer<typeof apiKeySchema>>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      name: "",
      domainId: "all",
    },
  });

  function handleSave(values: z.infer<typeof apiKeySchema>) {
    createApiKeyMutation.mutate(
      {
        name: values.name,
        permission: "FULL",
        domainId:
          values.domainId === "all" ? undefined : Number(values.domainId),
      },
      {
        onSuccess: (data) => {
          utils.apiKey.invalidate();
          setApiKey(data);
          apiKeyForm.reset();
        },
      }
    );
  }

  function handleCopy() {
    navigator.clipboard.writeText(apiKey);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  }

  function copyAndClose() {
    handleCopy();
    setApiKey("");
    setOpen(false);
    setShowApiKey(false);
    toast.success("Clave API copiada al portapapeles");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Agregar clave API
        </Button>
      </DialogTrigger>
      {apiKey ? (
        <DialogContent key={apiKey}>
          <DialogHeader>
            <DialogTitle>Copiar clave API</DialogTitle>
          </DialogHeader>
          <div className="py-1 bg-secondary rounded-lg px-4 flex items-center justify-between mt-2">
            <div>
              {showApiKey ? (
                <p className="text-sm">{apiKey}</p>
              ) : (
                <div className="flex gap-1">
                  {Array.from({ length: 40 }).map((_, index) => (
                    <div
                      key={index}
                      className="w-1 h-1 bg-muted-foreground rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-4">
              <Button
                variant="ghost"
                className="hover:bg-transparent p-0 cursor-pointer  group-hover:opacity-100"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>

              <Button
                variant="ghost"
                className="hover:bg-transparent p-0 cursor-pointer  group-hover:opacity-100"
                onClick={handleCopy}
              >
                {isCopied ? (
                  <CheckIcon className="h-4 w-4 text-green" />
                ) : (
                  <ClipboardCopy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div></div>
          <DialogFooter>
            <Button
              type="submit"
              onClick={copyAndClose}
              disabled={createApiKeyMutation.isPending}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear una nueva clave API</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Form {...apiKeyForm}>
              <form
                onSubmit={apiKeyForm.handleSubmit(handleSave)}
                className="space-y-8"
              >
                <FormField
                  control={apiKeyForm.control}
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
                  control={apiKeyForm.control}
                  name="domainId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Acceso a dominio</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
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
                            )
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
                    className=" w-[100px] hover:bg-gray-100 focus:bg-gray-100"
                    type="submit"
                    disabled={createApiKeyMutation.isPending}
                  >
                    {createApiKeyMutation.isPending ? "Creando..." : "Crear"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
