"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { EkycStepContent, type EkycStep } from "./_components/ekyc-step-content";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

async function postFaceVerify(
  documentFile: File,
  selfieFile: File,
  t: ReturnType<typeof useTranslations<"AccountPage.ekyc">>,
): Promise<boolean> {
  const url = `${API_BASE_URL}/dashboard/auth/ekyc/face-verify`;
  console.log("[ekyc] postFaceVerify start", { url, docName: documentFile.name, selfieName: selfieFile.name });
  const form = new FormData();
  form.append("image", documentFile);
  form.append("image2", selfieFile);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  console.log("[ekyc] postFaceVerify response", { ok: res.ok, status: res.status });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    console.log("[ekyc] postFaceVerify error", err);
    throw new Error(err.error ?? t("error_face"));
  }
  const result: { isMatch?: boolean } = await res.json();
  console.log("[ekyc] postFaceVerify result", result);
  return Boolean(result.isMatch);
}

interface EkycStatus {
  status: string;
  documentVerifiedAt?: string;
  faceVerifiedAt?: string;
  updatedAt?: string;
}

function getStepFromStatus(status: string): EkycStep {
  if (status === "verified" || status === "face_verified") return "success";
  if (status === "document_verified" || status === "document_submitted") return "face";
  return "document";
}

export default function EkycPage() {
  const t = useTranslations("AccountPage.ekyc");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<EkycStatus | null>(null);
  const [step, setStep] = useState<EkycStep>("document");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: EkycStatus = await res.json();
        setStatus(data);
        setStep(getStepFromStatus(data.status));
      } else {
        setStatus({ status: "not_started" });
        setStep("document");
      }
    } catch {
      setStatus({ status: "not_started" });
      setStep("document");
      toast({ title: t("error_fetch"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const submitDocument = async () => {
    if (!documentFile) return;
    if (!documentFile.type.match(/^image\/(jpeg|png)$/)) {
      toast({
        title: t("error_document"),
        description: "Use JPEG or PNG.",
        variant: "destructive",
      });
      return;
    }
    if (documentFile.size > 2 * 1024 * 1024) {
      toast({
        title: t("error_document"),
        description: "File must be under 2MB.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("image", documentFile);
      form.append("type", "cccd_front");
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/recognize-document`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("error_document"));
      }
      setStep("face");
      toast({ title: t("document_success") });
    } catch (e) {
      toast({
        title: t("error_document"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitFace = async () => {
    console.log("[ekyc] submitFace called", {
      hasSelfie: !!selfieFile,
      hasDocument: !!documentFile,
      selfieName: selfieFile?.name,
      documentName: documentFile?.name,
    });
    if (!selfieFile || !documentFile) {
      console.log("[ekyc] submitFace early return: missing selfie or document");
      return;
    }
    if (!selfieFile.type.match(/^image\/(jpeg|png)$/)) {
      toast({
        title: t("error_face"),
        description: "Use JPEG or PNG.",
        variant: "destructive",
      });
      return;
    }
    if (selfieFile.size > 2 * 1024 * 1024) {
      toast({
        title: t("error_face"),
        description: "File must be under 2MB.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    console.log("[ekyc] submitFace submitting...");
    try {
      const isMatch = await postFaceVerify(documentFile, selfieFile, t);
      console.log("[ekyc] submitFace isMatch", isMatch);
      if (isMatch) {
        setStep("success");
        void fetchStatus();
        toast({ title: t("face_success") });
      } else {
        toast({
          title: t("error_face"),
          description: t("face_mismatch"),
          variant: "destructive",
        });
      }
    } catch (e) {
      console.log("[ekyc] submitFace catch", e);
      toast({
        title: t("error_face"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
      console.log("[ekyc] submitFace done");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="ghost" size="sm" className="w-fit" asChild>
          <Link href="/dashboard/control/account">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back_to_account")}
          </Link>
        </Button>
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/dashboard/control/account">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("back_to_account")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EkycStepContent
            step={step}
            status={status?.status ?? null}
            documentFile={documentFile}
            selfieFile={selfieFile}
            submitting={submitting}
            onDocumentSelect={setDocumentFile}
            onSelfieSelect={setSelfieFile}
            onSubmitDocument={submitDocument}
            onSubmitFace={submitFace}
            t={t}
          />
        </CardContent>
      </Card>
    </div>
  );
}
