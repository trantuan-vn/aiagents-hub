"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { log } from "./_components/ekyc-debug";
import { EkycStepContent, type EkycStep, type DocType } from "./_components/ekyc-step-content";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface EkycStatus {
  status: string;
  documentVerifiedAt?: string;
  faceVerifiedAt?: string;
  updatedAt?: string;
}

interface FaceApiResponse {
  error?: string;
  isMatch?: boolean;
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
  const [docType, setDocType] = useState<DocType>("cccd");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentBackFile, setDocumentBackFile] = useState<File | null>(null);
  const handleDocTypeChange = useCallback((newType: DocType) => {
    setDocType(newType);
    if (newType === "passport") setDocumentBackFile(null);
  }, []);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [faceImages, setFaceImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [verifyTesting, setVerifyTesting] = useState(false);

  const fetchStatus = useCallback(async () => {
    log("fetchStatus: start");
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      log("fetchStatus: response", { ok: res.ok, status: res.status });
      if (res.ok) {
        const data: EkycStatus = await res.json();
        log("fetchStatus: success", { data });
        setStatus(data);
        setStep(getStepFromStatus(data.status));
      } else {
        log("fetchStatus: not ok, fallback to not_started");
        setStatus({ status: "not_started" });
        setStep("document");
      }
    } catch (e) {
      log("fetchStatus: error", e);
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

  const validateDocFiles = (front: File, back: File | null) => {
    if (!front.type.match(/^image\/(jpeg|png)$/) || (back && !back.type.match(/^image\/(jpeg|png)$/))) {
      toast({ title: t("error_document"), description: "Use JPEG or PNG.", variant: "destructive" });
      return false;
    }
    if (front.size > 2 * 1024 * 1024 || (back && back.size > 2 * 1024 * 1024)) {
      toast({ title: t("error_document"), description: "File must be under 2MB.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const buildDocumentForm = () => {
    const front = documentFile!;
    const back = docType === "cccd" ? documentBackFile : null;
    const form = new FormData();
    form.append("docType", docType);
    form.append("image_front", front);
    if (back) form.append("image_back", back);
    return form;
  };

  const submitDocument = async () => {
    const front = documentFile;
    const back = docType === "cccd" ? documentBackFile : null;
    log("submitDocument: start", { docType, hasFront: !!front, hasBack: !!back });
    if (!front || (docType === "cccd" && !back)) {
      log("submitDocument: abort - missing files");
      return;
    }
    if (!validateDocFiles(front, back)) {
      log("submitDocument: abort - validation failed");
      return;
    }

    setSubmitting(true);
    try {
      const form = buildDocumentForm();
      log("submitDocument: sending");
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/recognize-document`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      log("submitDocument: response", { ok: res.ok, status: res.status });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        log("submitDocument: error response", err);
        throw new Error(err.error ?? t("error_document"));
      }
      log("submitDocument: success, moving to face step");
      setStep("face");
      toast({ title: t("document_success") });
    } catch (e) {
      log("submitDocument: catch", e);
      toast({
        title: t("error_document"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const validateFaceFile = (file: File) => {
    if (!file.type.match(/^image\/(jpeg|png)$/)) {
      toast({ title: t("error_face"), description: "Use JPEG or PNG.", variant: "destructive" });
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t("error_face"), description: "File must be under 2MB.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const submitFace = async () => {
    const primary = faceImages.length > 0 ? faceImages[0] : selfieFile;
    log("submitFace: start", { hasPrimary: !!primary, faceImagesCount: faceImages.length });
    if (!primary || !validateFaceFile(primary)) {
      log("submitFace: abort - no primary or validation failed");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      if (faceImages.length > 0) {
        faceImages.forEach((f) => form.append("face_images", f));
      } else {
        form.append("image", primary);
      }
      log("submitFace: sending", { url: `${API_BASE_URL}/dashboard/auth/ekyc/face-submit` });
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/face-submit`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as FaceApiResponse;
      log("submitFace: response", { ok: res.ok, status: res.status, data });
      if (!res.ok) throw new Error(data.error ?? t("error_face"));

      if (data.isMatch) {
        log("submitFace: success, isMatch=true");
        setStep("success");
        void fetchStatus();
        toast({ title: t("face_success") });
      } else {
        log("submitFace: face_mismatch");
        toast({ title: t("error_face"), description: t("face_mismatch"), variant: "destructive" });
      }
    } catch (e) {
      log("submitFace: catch", e);
      toast({
        title: t("error_face"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const removeEkyc = async () => {
    log("removeEkyc: start");
    setRemoving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/remove`, {
        method: "POST",
        credentials: "include",
      });
      log("removeEkyc: response", { ok: res.ok, status: res.status });
      if (!res.ok) throw new Error("Failed to remove eKYC");
      setStep("document");
      setDocumentFile(null);
      setDocumentBackFile(null);
      setSelfieFile(null);
      setFaceImages([]);
      void fetchStatus();
      toast({ title: t("remove_success") });
    } catch (e) {
      log("removeEkyc: catch", e);
      toast({ title: t("error_remove"), variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  const verifyTest = async (file: File) => {
    log("verifyTest: start", { fileName: file.name, size: file.size });
    setVerifyTesting(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/face-verify-test`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as FaceApiResponse;
      log("verifyTest: response", { ok: res.ok, status: res.status, data });
      if (!res.ok) throw new Error(data.error ?? t("error_face"));
      if (data.isMatch) {
        log("verifyTest: success, isMatch=true");
        toast({ title: t("verify_test_success") });
      } else {
        log("verifyTest: fail, isMatch=false");
        toast({ title: t("verify_test_fail"), variant: "destructive" });
      }
    } catch (e) {
      log("verifyTest: catch", e);
      toast({ title: t("error_face"), variant: "destructive" });
    } finally {
      setVerifyTesting(false);
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
            documentBackFile={documentBackFile}
            docType={docType}
            selfieFile={selfieFile}
            faceImages={faceImages}
            submitting={submitting}
            removing={removing}
            verifyTesting={verifyTesting}
            onDocumentSelect={setDocumentFile}
            onDocumentBackSelect={setDocumentBackFile}
            onDocTypeChange={handleDocTypeChange}
            onSelfieSelect={setSelfieFile}
            onFaceImagesSelect={setFaceImages}
            onSubmitDocument={submitDocument}
            onSubmitFace={submitFace}
            onRemoveEkyc={removeEkyc}
            onVerifyTest={verifyTest}
            t={t}
          />
        </CardContent>
      </Card>
    </div>
  );
}
