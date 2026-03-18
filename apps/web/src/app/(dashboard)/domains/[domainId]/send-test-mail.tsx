"use client";

import { Button } from "@usesend/ui/src/button";
import { api } from "~/trpc/react";
import React from "react";
import { toast } from "@usesend/ui/src/toaster";
import { SendHorizonal } from "lucide-react";
import type { DomainWithDnsRecords } from "~/types/domain";
// Removed dialog and example code. Clicking the button now sends the email directly.

export const SendTestMail: React.FC<{ domain: DomainWithDnsRecords }> = ({
  domain,
}) => {
  const sendTestEmailFromDomainMutation =
    api.domain.sendTestEmailFromDomain.useMutation();

  const utils = api.useUtils();

  function handleSendTestEmail() {
    sendTestEmailFromDomainMutation.mutate(
      {
        id: domain.id,
      },
      {
        onSuccess: () => {
          utils.domain.domains.invalidate();
          toast.success(`Correo de prueba enviado`);
        },
        onError: (err) => {
          toast.error(err.message || "Error al enviar el correo de prueba");
        },
      },
    );
  }

  return (
    <Button
      onClick={handleSendTestEmail}
      disabled={sendTestEmailFromDomainMutation.isPending}
    >
      <SendHorizonal className="h-4 w-4 mr-2" />
      {sendTestEmailFromDomainMutation.isPending
        ? "Enviando correo..."
        : "Enviar correo de prueba"}
    </Button>
  );
};

export default SendTestMail;
