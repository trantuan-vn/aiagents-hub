"use client";

import Link from "next/link";

import { Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export type AuthenticatorStep = "idle" | "setup" | "verify" | "success" | "disable";

export function IdleDisabledContent({
  t,
  startSetup,
  submitting,
}: {
  t: (key: string) => string;
  startSetup: () => Promise<void>;
  submitting: boolean;
}) {
  return (
    <div>
      <Button onClick={startSetup} disabled={submitting}>
        {t("step_setup")}
      </Button>
    </div>
  );
}

export function IdleEnabledContent({
  t,
  disableCode,
  setDisableCode,
  submitting,
  submitDisable,
}: {
  t: (key: string) => string;
  disableCode: string;
  setDisableCode: (v: string) => void;
  submitting: boolean;
  submitDisable: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">Authenticator is enabled for your account.</p>
      <div className="bg-muted/30 rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">{t("disable")}</p>
        <p className="text-muted-foreground mb-4 text-sm">{t("disable_confirm")}</p>
        <InputOTP maxLength={6} value={disableCode} onChange={(v) => setDisableCode(v)}>
          <InputOTPGroup className="gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <Button
          className="mt-4"
          variant="destructive"
          size="sm"
          disabled={disableCode.length !== 6 || submitting}
          onClick={submitDisable}
        >
          {t("disable")}
        </Button>
      </div>
    </div>
  );
}

export function renderStepContent(
  step: AuthenticatorStep,
  enabled: boolean | null,
  setupData: { secret: string; qrCodeUrl: string } | null,
  code: string,
  disableCode: string,
  submitting: boolean,
  t: (key: string) => string,
  setCode: (v: string) => void,
  setDisableCode: (v: string) => void,
  startSetup: () => Promise<void>,
  submitVerify: () => Promise<void>,
  submitDisable: () => Promise<void>,
  copySecret: () => void,
) {
  if (step === "idle") {
    return enabled ? (
      <IdleEnabledContent
        t={t}
        disableCode={disableCode}
        setDisableCode={setDisableCode}
        submitting={submitting}
        submitDisable={submitDisable}
      />
    ) : (
      <IdleDisabledContent t={t} startSetup={startSetup} submitting={submitting} />
    );
  }
  if (step === "setup" && setupData) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("scan_qr")}</p>
        <div className="bg-muted/30 flex justify-center rounded-lg border p-4">
          <QRCodeSVG
            value={setupData.qrCodeUrl}
            size={200}
            level="M"
            bgColor="#ffffff"
            fgColor="#0a0a0a"
            title="Authenticator QR code"
          />
        </div>
        <p className="text-muted-foreground text-sm">{t("or_enter_secret")}</p>
        <div className="bg-muted/30 flex items-center gap-2 rounded-lg border p-3 font-mono text-sm">
          <span className="break-all">{setupData.secret}</span>
          <Button variant="ghost" size="icon" onClick={copySecret} title="Copy">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{t("manual_entry_hint")}</p>
        <div className="border-t pt-4">
          <p className="text-muted-foreground mb-2 text-sm">{t("enter_code")}</p>
          <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v)}>
            <InputOTPGroup className="gap-1">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button className="mt-4" disabled={code.length !== 6 || submitting} onClick={submitVerify}>
            {t("verify")}
          </Button>
        </div>
      </div>
    );
  }
  if (step === "success") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-emerald-600">{t("verified_success")}</p>
        <Button asChild>
          <Link href="/dashboard/control/account">{t("back_to_account")}</Link>
        </Button>
      </div>
    );
  }
  if (step === "verify" || (step === "setup" && !setupData)) {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }
  return null;
}
