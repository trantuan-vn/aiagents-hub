"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { siGmail } from "simple-icons";
import { toast } from "sonner";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createWorkflowCredential } from "../../../../_lib/api";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300] text-white";
const GMAIL_SMTP_HOST = "smtp.gmail.com";
const GMAIL_SMTP_PORT = 465;
const APP_PASSWORD_HELP = "https://support.google.com/accounts/answer/185833";

type GmailCredentialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (credentialKey: string, name: string, email?: string) => void;
  initialEmail?: string;
};

export function GmailCredentialDialog({
  open,
  onOpenChange,
  onSaved,
  initialEmail = "",
}: GmailCredentialDialogProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEmail(initialEmail);
    setPassword("");
    setSaving(false);
  };

  const handleSave = async () => {
    const username = email.trim().toLowerCase();
    if (!username || !password) {
      toast.error(t("gmail_credential_smtp_required"));
      return;
    }
    setSaving(true);
    try {
      const name = t("gmail_credential_smtp_name", { email: username });
      const { credential } = await createWorkflowCredential({
        name,
        type: "basic",
        secret: password.replace(/\s+/g, ""),
        meta: {
          provider: "gmail",
          authMethod: "smtp",
          username,
          smtpHost: GMAIL_SMTP_HOST,
          smtpPort: GMAIL_SMTP_PORT,
          connected: true,
        },
      });
      onSaved(credential.credentialKey, credential.name, username);
      toast.success(t("form_credential_saved"));
      onOpenChange(false);
      reset();
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
        else setEmail(initialEmail);
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex flex-row items-start gap-3 space-y-0 border-b px-5 py-4">
          <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
            <SimpleIcon icon={siGmail} className="size-4" />
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <DialogTitle className="text-base font-semibold">
              {t("gmail_credential_title")}
            </DialogTitle>
            <p className="text-muted-foreground text-sm">{t("gmail_credential_smtp_subtitle")}</p>
          </div>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("gmail_credential_email")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("gmail_credential_email_placeholder")}
              className="h-9 text-sm"
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("gmail_credential_app_password")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("gmail_credential_app_password_placeholder")}
              className="h-9 text-sm"
              autoComplete="new-password"
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("gmail_credential_app_password_hint")}{" "}
              <a
                href={APP_PASSWORD_HELP}
                target="_blank"
                rel="noreferrer"
                className="text-[#ff6f00] font-medium underline-offset-2 hover:underline"
              >
                {t("gmail_credential_app_password_help")}
              </a>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button type="button" className={ORANGE} disabled={saving} onClick={() => void handleSave()}>
            {saving ? t("form_credential_saving") : t("form_credential_save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
