"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@usesend/ui/src/dialog";
import { CheckCircle2 } from "lucide-react";
import { useUpgradeModalStore } from "~/store/upgradeModalStore";
import { PLAN_PERKS } from "~/lib/constants/payments";
import { LimitReason } from "~/lib/constants/plans";
import { UpgradeButton } from "./UpgradeButton";

export const UpgradeModal = () => {
  const {
    isOpen,
    reason,
    action: { closeModal },
  } = useUpgradeModalStore();

  const basicPlanPerks = PLAN_PERKS.BASIC || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar al Plan Básico</DialogTitle>
          <DialogDescription>
            {(() => {
              const messages: Record<LimitReason, string> = {
                [LimitReason.DOMAIN]:
                  "Has alcanzado el límite de dominios de tu plan actual.",
                [LimitReason.CONTACT_BOOK]:
                  "Has alcanzado el límite de libretas de contactos de tu plan actual.",
                [LimitReason.TEAM_MEMBER]:
                  "Has alcanzado el límite de miembros del equipo de tu plan actual.",
                [LimitReason.WEBHOOK]:
                  "Has alcanzado el límite de webhooks de tu plan actual.",
                [LimitReason.EMAIL_BLOCKED]:
                  "Has alcanzado el límite de envío de correos de tu plan actual.",
                [LimitReason.EMAIL_DAILY_LIMIT_REACHED]:
                  "Has alcanzado el límite de envío de correos de tu plan actual.",
                [LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED]:
                  "Has alcanzado el límite de envío de correos de tu plan actual.",
              };
              return reason
                ? `${messages[reason] ?? ""} Actualiza para desbloquear esta función y más.`
                : "Desbloquea más funciones con nuestro plan Básico.";
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-3">Lo que obtendrás:</h4>
            <ul className="space-y-2">
              {basicPlanPerks.map((perk, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{perk}</span>
                </li>
              ))}
            </ul>
          </div>

          <UpgradeButton />
        </div>
      </DialogContent>
    </Dialog>
  );
};
