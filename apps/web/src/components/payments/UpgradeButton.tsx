import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { cn } from "@usesend/ui/lib/utils";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export const UpgradeButton = ({
  planId,
  className,
}: {
  planId?: number;
  className?: string;
}) => {
  const router = useRouter();
  const checkoutMutation = api.billing.createCheckoutSession.useMutation();

  const onClick = async () => {
    if (!planId) {
      router.push("/pricing");
      return;
    }
    const url = await checkoutMutation.mutateAsync({ planId });
    if (url) {
      window.location.href = url;
    }
  };

  return (
    <Button
      onClick={onClick}
      className={cn("mt-4 w-[120px]", className)}
      disabled={checkoutMutation.isPending}
    >
      {checkoutMutation.isPending ? <Spinner className="w-4 h-4" /> : "Actualizar"}
    </Button>
  );
};
