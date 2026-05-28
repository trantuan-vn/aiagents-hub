"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { STEP_UP_SESSION_KEY } from "../_components/sensitive-step-up";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type StepUpMethod = "passkey" | "authenticator" | "sms" | "otp_email";
type AuthOptionsJSON = Parameters<typeof startAuthentication>[0];

export default function StepUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [requiredMethod, setRequiredMethod] = useState<StepUpMethod | null>(null);
  const [challengeKey, setChallengeKey] = useState<string | null>(null);
  const [passkeyOptions, setPasskeyOptions] = useState<AuthOptionsJSON | null>(null);
  const [code, setCode] = useState("");

  const returnTo = useMemo(() => {
    const q = searchParams.get("returnTo");
    if (!q || !q.startsWith("/dashboard")) return "/dashboard";
    return q;
  }, [searchParams]);

  const requestStepUp = useCallback(async () => {
    setRequesting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/step-up/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        requiredMethod?: StepUpMethod;
        options?: AuthOptionsJSON;
        challengeKey?: string;
        error?: string;
      };
      if (!res.ok || !data.requiredMethod) {
        throw new Error(data.error ?? "Failed to request verification");
      }
      setRequiredMethod(data.requiredMethod);
      setPasskeyOptions(data.options ?? null);
      setChallengeKey(data.challengeKey ?? null);
      setCode("");
    } catch (e) {
      toast({
        title: "Cannot start verification",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await requestStepUp();
    })();
    return () => {
      cancelled = true;
    };
  }, [requestStepUp]);

  const verify = useCallback(async () => {
    if (!requiredMethod || verifying) return;
    setVerifying(true);
    try {
      let body: Record<string, unknown> = { method: requiredMethod };

      if (requiredMethod === "passkey") {
        if (!passkeyOptions || !challengeKey) throw new Error("Passkey challenge missing");
        const response = await startAuthentication(passkeyOptions);
        body = { ...body, response, challengeKey };
      } else {
        const normalized = code.replace(/\D/g, "").slice(0, 6);
        if (normalized.length !== 6) throw new Error("Code must be 6 digits");
        body = { ...body, code: normalized };
      }

      const res = await fetch(`${API_BASE_URL}/dashboard/auth/step-up/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Verification failed");
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          STEP_UP_SESSION_KEY,
          JSON.stringify({ path: returnTo, at: Date.now() }),
        );
      }
      toast({ title: "Verification successful" });
      router.replace(returnTo);
    } catch (e) {
      toast({
        title: "Verification failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  }, [challengeKey, code, passkeyOptions, requiredMethod, returnTo, router, toast, verifying]);

  const methodLabel = useMemo(() => {
    if (requiredMethod === "passkey") return "Passkey";
    if (requiredMethod === "authenticator") return "Authenticator app";
    if (requiredMethod === "sms") return "SMS code";
    if (requiredMethod === "otp_email") return "Email OTP";
    return "Verification";
  }, [requiredMethod]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Security verification required</CardTitle>
          <CardDescription>
            Verify identity before opening this sensitive function.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTitle>Required method</AlertTitle>
            <AlertDescription>{requiredMethod ? methodLabel : "Loading..."}</AlertDescription>
          </Alert>

          {!loading && requiredMethod === "passkey" ? (
            <Button className="w-full" onClick={() => void verify()} disabled={verifying || requesting}>
              {verifying ? "Verifying..." : "Verify with passkey"}
            </Button>
          ) : null}

          {!loading && requiredMethod && requiredMethod !== "passkey" ? (
            <div className="space-y-3">
              <Input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="font-mono"
                disabled={verifying}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void verify()} disabled={verifying || requesting}>
                  {verifying ? "Verifying..." : "Verify"}
                </Button>
                {(requiredMethod === "sms" || requiredMethod === "otp_email") && (
                  <Button variant="outline" onClick={() => void requestStepUp()} disabled={requesting || verifying}>
                    {requesting ? "Sending..." : "Resend"}
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {!loading && !requiredMethod ? (
            <Button variant="outline" onClick={() => void requestStepUp()} disabled={requesting}>
              Retry
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
