"use client";

import { useState } from "react";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createWorkflowCredential } from "../../../_lib/api";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

type FormBasicCredentialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (credentialKey: string, name: string) => void;
};

export function FormBasicCredentialDialog({
  open,
  onOpenChange,
  onSaved,
}: FormBasicCredentialDialogProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setUsername("");
    setPassword("");
  };

  const handleSave = async () => {
    if (!username.trim() || !password) {
      toast.error(t("form_credential_required"));
      return;
    }
    setSaving(true);
    try {
      const credentialName = name.trim() || `Form Basic Auth ${username.trim()}`;
      const { credential } = await createWorkflowCredential({
        name: credentialName,
        type: "basic",
        secret: password,
        meta: { username: username.trim() },
      });
      onSaved(credential.credentialKey, credential.name);
      toast.success(t("form_credential_saved"));
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("form_credential_save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex flex-row items-start gap-3 space-y-0 border-b px-5 py-4">
          <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
            <Globe className="text-muted-foreground size-4" />
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <DialogTitle className="text-base font-semibold">
              {name.trim() || t("form_credential_unnamed")}
            </DialogTitle>
            <p className="text-muted-foreground text-sm">{t("form_auth_basic")}</p>
          </div>
        </DialogHeader>

        <div className="grid min-h-[280px] grid-cols-[140px_1fr]">
          <nav className="bg-muted/30 border-r px-2 py-3">
            <button
              type="button"
              className="bg-background w-full rounded-md px-3 py-2 text-left text-sm font-medium shadow-sm"
            >
              {t("form_credential_connection")}
            </button>
          </nav>

          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("form_credential_name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form_credential_name_placeholder")}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("form_credential_user")}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 text-sm"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("form_credential_password")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 text-sm"
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button
            type="button"
            className={ORANGE}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? t("form_credential_saving") : t("form_credential_save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
