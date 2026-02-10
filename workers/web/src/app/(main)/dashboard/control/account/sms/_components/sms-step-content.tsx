"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

export type SmsStep = "idle" | "request" | "verify" | "success" | "disable";

export function IdleSmsDisabledContent({
  t,
  phone,
  setPhone,
  submitting,
  onRequest,
}: {
  t: (key: string) => string;
  phone: string;
  setPhone: (v: string) => void;
  submitting: boolean;
  onRequest: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("enter_phone")}</p>
      <div className="space-y-2">
        <Label htmlFor="phone">{t("phone_number")}</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+84123456789"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting}
          className="font-mono"
        />
      </div>
      <Button onClick={onRequest} disabled={!phone.trim() || submitting}>
        {t("send_code")}
      </Button>
    </div>
  );
}

export function IdleSmsEnabledContent({
  t,
  disableCode,
  setDisableCode,
  submitting,
  onDisable,
}: {
  t: (key: string) => string;
  disableCode: string;
  setDisableCode: (v: string) => void;
  submitting: boolean;
  onDisable: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("sms_enabled_hint")}</p>
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
        <p className="text-muted-foreground mt-2 text-xs">{t("disable_totp_hint")}</p>
        <Button
          className="mt-4"
          variant="destructive"
          size="sm"
          disabled={disableCode.length !== 6 || submitting}
          onClick={onDisable}
        >
          {t("disable")}
        </Button>
      </div>
    </div>
  );
}

export function VerifySmsContent({
  t,
  code,
  setCode,
  submitting,
  onVerify,
}: {
  t: (key: string) => string;
  code: string;
  setCode: (v: string) => void;
  submitting: boolean;
  onVerify: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("enter_code_sent")}</p>
      <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v)}>
        <InputOTPGroup className="gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <Button disabled={code.length !== 6 || submitting} onClick={onVerify}>
        {t("verify")}
      </Button>
    </div>
  );
}

export function renderSmsStepContent(
  step: SmsStep,
  enabled: boolean | null,
  phone: string,
  code: string,
  disableCode: string,
  submitting: boolean,
  t: (key: string) => string,
  setPhone: (v: string) => void,
  setCode: (v: string) => void,
  setDisableCode: (v: string) => void,
  onRequest: () => Promise<void>,
  onVerify: () => Promise<void>,
  onDisable: () => Promise<void>,
) {
  if (step === "idle") {
    return enabled ? (
      <IdleSmsEnabledContent
        t={t}
        disableCode={disableCode}
        setDisableCode={setDisableCode}
        submitting={submitting}
        onDisable={onDisable}
      />
    ) : (
      <IdleSmsDisabledContent t={t} phone={phone} setPhone={setPhone} submitting={submitting} onRequest={onRequest} />
    );
  }
  if (step === "verify") {
    return <VerifySmsContent t={t} code={code} setCode={setCode} submitting={submitting} onVerify={onVerify} />;
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
  return null;
}
