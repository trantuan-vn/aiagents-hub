"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/enterprise/confirm-action";
import { Button } from "@/components/ui/button";
import { adminFlags } from "@/lib/enterprise-admin-api";
import { EnterpriseApiError, useEnterpriseErrorMessage } from "@/lib/enterprise-api";

type Props = {
  ownerId: string;
  workflowId: number;
  name: string;
  onDone: () => void;
};

/** §3.1: a plain turn-off first; an accepted workflow answers 409 and needs an explicit forced confirm. */
export function TurnOffFlagButton({ ownerId, workflowId, name, onDone }: Props) {
  const t = useTranslations("EnterpriseAdminPage");
  const errorMessage = useEnterpriseErrorMessage();
  const [step, setStep] = useState<"idle" | "confirm" | "force">("idle");

  const run = async (force: boolean) => {
    try {
      await adminFlags.setFlag(ownerId, workflowId, { isEnterprise: false, ...(force ? { force: true } : {}) });
      toast.success(t("flag_off_done"));
      onDone();
    } catch (err) {
      if (!force && err instanceof EnterpriseApiError && err.code === "ENTERPRISE_ACCEPTED") {
        setTimeout(() => setStep("force"), 0);
        return;
      }
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setStep("confirm")}>
        {t("flag_off")}
      </Button>
      <ConfirmAction
        open={step === "confirm"}
        onOpenChange={(open) => setStep(open ? "confirm" : "idle")}
        title={t("flag_off_title", { name })}
        description={t("flag_off_body")}
        confirmLabel={t("flag_off")}
        onConfirm={() => run(false)}
      />
      <ConfirmAction
        open={step === "force"}
        onOpenChange={(open) => setStep(open ? "force" : "idle")}
        title={t("flag_force_title", { name })}
        description={t("flag_force_body")}
        confirmLabel={t("flag_force")}
        destructive
        onConfirm={() => run(true)}
      />
    </>
  );
}
