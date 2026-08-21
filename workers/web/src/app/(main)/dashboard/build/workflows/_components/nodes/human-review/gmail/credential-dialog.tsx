"use client";

import { useEffect, useRef, useState } from "react";

import { AlertTriangle, CheckCircle2, HelpCircle, Info, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { siGmail, siGoogle } from "simple-icons";
import { toast } from "sonner";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { startGmailOAuth } from "../../../../_lib/api";
import {
  clearGmailOAuthResultStorage,
  GMAIL_OAUTH_CHANNEL,
  isGmailOAuthResultMessage,
  readGmailOAuthResultFromStorage,
  type GmailOAuthResultMessage,
} from "./oauth-bridge";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300] text-white";

type GmailCredentialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (credentialKey: string, name: string, email?: string) => void;
  /** Prefill when reopening setup for an already-linked credential. */
  initialConnected?: { email?: string; name?: string; key?: string } | null;
};

type NavTab = "connection" | "sharing" | "details";

export function GmailCredentialDialog({
  open,
  onOpenChange,
  onSaved,
  initialConnected,
}: GmailCredentialDialogProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [nav, setNav] = useState<NavTab>("connection");
  const [oauthMode, setOauthMode] = useState("managed");
  const [allowedDomains, setAllowedDomains] = useState("all");
  const [domainsMode, setDomainsMode] = useState<"fixed" | "expression">("fixed");
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [connectedCredential, setConnectedCredential] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const handledTsRef = useRef<number>(0);

  const reset = () => {
    setNav("connection");
    setOauthMode("managed");
    setAllowedDomains("all");
    setDomainsMode("fixed");
    setConnectedEmail(null);
    setConnectedCredential(null);
    setConnecting(false);
    try {
      popupRef.current?.close();
    } catch {
      /* ignore */
    }
    popupRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    if (initialConnected?.email || initialConnected?.key) {
      setConnectedEmail(initialConnected.email || t("gmail_credential_connected_label"));
      if (initialConnected.key) {
        setConnectedCredential({
          key: initialConnected.key,
          name: initialConnected.name || t("gmail_credential_default_name"),
        });
      }
    }
  }, [open, initialConnected, t]);

  const applyOAuthResult = (data: GmailOAuthResultMessage) => {
    const ts = data.ts ?? Date.now();
    if (ts <= handledTsRef.current) return;
    handledTsRef.current = ts;

    setConnecting(false);
    try {
      popupRef.current?.close();
    } catch {
      /* ignore */
    }
    popupRef.current = null;
    clearGmailOAuthResultStorage();

    if (!data.ok || !data.credentialKey) {
      toast.error(data.error || t("gmail_credential_oauth_failed"));
      return;
    }

    const name = data.name || t("gmail_credential_default_name");
    const email = data.email || t("gmail_credential_connected_label");
    setConnectedEmail(email);
    setConnectedCredential({ key: data.credentialKey, name });
    toast.success(t("gmail_credential_connected"));
    onSaved(data.credentialKey, name, data.email);
  };

  useEffect(() => {
    if (!open) return;

    const onMessage = (event: MessageEvent) => {
      if (!isGmailOAuthResultMessage(event.data)) return;
      applyOAuthResult(event.data);
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
      bc.onmessage = (event) => {
        if (!isGmailOAuthResultMessage(event.data)) return;
        applyOAuthResult(event.data);
      };
    } catch {
      bc = null;
    }

    const poll = window.setInterval(() => {
      if (!connecting && !popupRef.current) return;
      const stored = readGmailOAuthResultFromStorage();
      if (stored) applyOAuthResult(stored);
    }, 500);

    // Catch result if popup finished before listener attached.
    const stored = readGmailOAuthResultFromStorage();
    if (stored) applyOAuthResult(stored);

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyOAuthResult closes over latest handlers
  }, [open, connecting, onSaved, t]);

  const handleSignIn = async () => {
    clearGmailOAuthResultStorage();
    setConnecting(true);
    try {
      const { url } = await startGmailOAuth({
        oauthMode,
        allowedHttpRequestDomains: allowedDomains,
      });
      const popup = window.open(url, "gmail-oauth", "width=520,height=700,menubar=no,toolbar=no");
      if (!popup) {
        toast.error(t("gmail_credential_popup_blocked"));
        setConnecting(false);
        return;
      }
      popupRef.current = popup;
      popup.focus();
    } catch (error) {
      setConnecting(false);
      toast.error(error instanceof Error ? error.message : t("gmail_credential_oauth_failed"));
    }
  };

  const handleSave = () => {
    if (!connectedCredential) {
      toast.error(t("gmail_credential_connect_required"));
      return;
    }
    onSaved(connectedCredential.key, connectedCredential.name, connectedEmail ?? undefined);
    toast.success(t("form_credential_saved"));
    onOpenChange(false);
    reset();
  };

  const isConnected = !!connectedCredential && !!connectedEmail;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
              <SimpleIcon icon={siGmail} className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">
                {t("gmail_credential_title")}
              </DialogTitle>
              <p className="text-muted-foreground text-sm">{t("gmail_credential_subtitle")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              className={cn(ORANGE, "h-8 px-3 text-xs")}
              disabled={connecting || !connectedCredential}
              onClick={handleSave}
            >
              {t("form_credential_save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => onOpenChange(false)}
              aria-label={t("close")}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid min-h-[360px] grid-cols-[160px_1fr]">
          <nav className="bg-muted/30 border-r px-2 py-3">
            {(
              [
                ["connection", "gmail_credential_connection"],
                ["sharing", "gmail_credential_sharing"],
                ["details", "gmail_credential_details"],
              ] as const
            ).map(([id, labelKey]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "mb-1 w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  nav === id
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:bg-background/60",
                )}
                onClick={() => setNav(id)}
              >
                {t(labelKey)}
              </button>
            ))}
          </nav>

          <div className="flex min-h-0 flex-col p-5">
            {nav === "connection" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{t("gmail_credential_setup")}</h3>
                  <Select value={oauthMode} onValueChange={setOauthMode}>
                    <SelectTrigger className="h-8 w-[240px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="managed">{t("gmail_credential_oauth_managed")}</SelectItem>
                      <SelectItem value="custom">{t("gmail_credential_oauth_custom")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-3",
                    isConnected
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-amber-500/25 bg-amber-500/10",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {isConnected ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isConnected
                            ? "text-emerald-950 dark:text-emerald-100"
                            : "text-amber-950 dark:text-amber-100",
                        )}
                      >
                        {isConnected
                          ? t("gmail_credential_connected_success")
                          : t("gmail_credential_connect_prompt")}
                      </p>
                      {isConnected && connectedEmail ? (
                        <p className="text-emerald-900/80 dark:text-emerald-100/80 mt-0.5 truncate text-xs">
                          {t("gmail_credential_connected_as", { email: connectedEmail })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-2 bg-white text-xs dark:bg-background"
                    disabled={connecting}
                    onClick={() => void handleSignIn()}
                  >
                    {connecting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <SimpleIcon icon={siGoogle} className="size-4" />
                    )}
                    {isConnected ? t("gmail_credential_reconnect") : t("gmail_sign_in_google")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">{t("gmail_credential_allowed_domains")}</Label>
                      <HelpCircle className="text-muted-foreground size-3.5" />
                    </div>
                    <div className="bg-muted inline-flex rounded-md p-0.5">
                      <button
                        type="button"
                        className={cn(
                          "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                          domainsMode === "fixed"
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground",
                        )}
                        onClick={() => setDomainsMode("fixed")}
                      >
                        {t("gmail_credential_fixed")}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                          domainsMode === "expression"
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground",
                        )}
                        onClick={() => setDomainsMode("expression")}
                      >
                        {t("gmail_credential_expression")}
                      </button>
                    </div>
                  </div>
                  {domainsMode === "fixed" ? (
                    <Select value={allowedDomains} onValueChange={setAllowedDomains}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("gmail_credential_domains_all")}</SelectItem>
                        <SelectItem value="gmail">{t("gmail_credential_domains_gmail")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={allowedDomains}
                      onChange={(e) => setAllowedDomains(e.target.value)}
                      placeholder="{{ $json.domains }}"
                      className="h-9 font-mono text-xs"
                    />
                  )}
                </div>

                <div className="text-muted-foreground mt-auto flex items-start gap-2 pt-2 text-xs">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    {t("gmail_credential_vault_hint")}{" "}
                    <span className="text-[#ff6f00] cursor-default font-medium">
                      {t("gmail_credential_more_info")}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {nav === "sharing"
                  ? t("gmail_credential_sharing_placeholder")
                  : t("gmail_credential_details_placeholder")}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
