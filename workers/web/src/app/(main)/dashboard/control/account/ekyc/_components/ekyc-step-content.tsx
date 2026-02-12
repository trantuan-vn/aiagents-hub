"use client";

import { useCallback, useRef } from "react";

import { Camera, CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type EkycStep = "document" | "face" | "success";

interface EkycStepContentProps {
  step: EkycStep;
  status: string | null;
  documentFile: File | null;
  selfieFile: File | null;
  submitting: boolean;
  onDocumentSelect: (file: File) => void;
  onSelfieSelect: (file: File) => void;
  onSubmitDocument: () => void;
  onSubmitFace: () => void;
  t: ReturnType<typeof useTranslations<"AccountPage.ekyc">>;
}

const ACCEPT_IMAGE = "image/jpeg,image/png";
const MAX_SIZE_MB = 2;

function validateFile(file: File): string | null {
  if (!file.type.match(/^image\/(jpeg|png)$/)) return "Invalid file type. Use JPEG or PNG.";
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return `File must be under ${MAX_SIZE_MB}MB.`;
  return null;
}

const dropZoneClass =
  "border-muted-foreground/25 bg-muted/30 hover:bg-muted/50 flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors";

function DocumentStepBlock({
  documentFile,
  submitting,
  docInputRef,
  onDocChange,
  onSubmitDocument,
  t,
}: {
  documentFile: File | null;
  submitting: boolean;
  docInputRef: React.RefObject<HTMLInputElement>;
  onDocChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmitDocument: () => void;
  t: EkycStepContentProps["t"];
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="pt-6">
        <p className="text-muted-foreground mb-4 text-sm">{t("document_hint")}</p>
        <input ref={docInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={onDocChange} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => docInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && docInputRef.current?.click()}
          className={dropZoneClass}
        >
          {documentFile ? (
            <>
              <CheckCircle2 className="text-muted-foreground h-10 w-10" />
              <span className="text-sm font-medium">{documentFile.name}</span>
              <span className="text-muted-foreground text-xs">({(documentFile.size / 1024).toFixed(1)} KB)</span>
            </>
          ) : (
            <>
              <FileUp className="text-muted-foreground h-10 w-10" />
              <span className="text-sm">{t("document_upload")}</span>
              <span className="text-muted-foreground text-xs">{t("document_formats")}</span>
            </>
          )}
        </div>
        <Button className="mt-4 w-full" disabled={!documentFile || submitting} onClick={onSubmitDocument}>
          {submitting ? t("processing") : t("submit_document")}
        </Button>
      </CardContent>
    </Card>
  );
}

function FaceStepBlock({
  selfieFile,
  submitting,
  selfieInputRef,
  onSelfieChange,
  onSubmitFace,
  t,
}: {
  selfieFile: File | null;
  submitting: boolean;
  selfieInputRef: React.RefObject<HTMLInputElement>;
  onSelfieChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmitFace: () => void;
  t: EkycStepContentProps["t"];
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="pt-6">
        <p className="text-muted-foreground mb-4 text-sm">{t("face_hint")}</p>
        <input ref={selfieInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={onSelfieChange} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => selfieInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && selfieInputRef.current?.click()}
          className={dropZoneClass}
        >
          {selfieFile ? (
            <>
              <CheckCircle2 className="text-muted-foreground h-10 w-10" />
              <span className="text-sm font-medium">{selfieFile.name}</span>
            </>
          ) : (
            <>
              <Camera className="text-muted-foreground h-10 w-10" />
              <span className="text-sm">{t("selfie_upload")}</span>
              <span className="text-muted-foreground text-xs">{t("face_formats")}</span>
            </>
          )}
        </div>
        <Button
          className="mt-4 w-full"
          disabled={!selfieFile || submitting}
          onClick={() => {
            console.log("[ekyc] Verify face button clicked", { hasSelfie: !!selfieFile, submitting });
            onSubmitFace();
          }}
        >
          {submitting ? t("processing") : t("submit_face")}
        </Button>
      </CardContent>
    </Card>
  );
}

function SuccessBlock({ t }: { t: EkycStepContentProps["t"] }) {
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardContent className="flex flex-col items-center gap-4 pt-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <ShieldCheck className="h-8 w-8 text-emerald-600" />
        </div>
        <div className="space-y-1 text-center">
          <h3 className="font-semibold">{t("success_title")}</h3>
          <p className="text-muted-foreground text-sm">{t("success_description")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function EkycStepContent({
  step,
  status,
  documentFile,
  selfieFile,
  submitting,
  onDocumentSelect,
  onSelfieSelect,
  onSubmitDocument,
  onSubmitFace,
  t,
}: EkycStepContentProps) {
  const docInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const handleDocChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const err = validateFile(f);
      if (err) return;
      onDocumentSelect(f);
    },
    [onDocumentSelect],
  );

  const handleSelfieChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const err = validateFile(f);
      if (err) return;
      onSelfieSelect(f);
    },
    [onSelfieSelect],
  );

  const steps: { key: EkycStep; label: string; icon: typeof FileUp }[] = [
    { key: "document", label: t("step_document"), icon: FileUp },
    { key: "face", label: t("step_face"), icon: Camera },
    { key: "success", label: t("step_done"), icon: ShieldCheck },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);
  const progress = step === "success" ? 100 : ((stepIndex + 0.5) / steps.length) * 100;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={cn(
                "flex items-center gap-1.5",
                i <= stepIndex ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </span>
          ))}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {step === "document" && (
        <DocumentStepBlock
          documentFile={documentFile}
          submitting={submitting}
          docInputRef={docInputRef}
          onDocChange={handleDocChange}
          onSubmitDocument={onSubmitDocument}
          t={t}
        />
      )}

      {step === "face" && (
        <FaceStepBlock
          selfieFile={selfieFile}
          submitting={submitting}
          selfieInputRef={selfieInputRef}
          onSelfieChange={handleSelfieChange}
          onSubmitFace={onSubmitFace}
          t={t}
        />
      )}

      {step === "success" && <SuccessBlock t={t} />}

      {status && (
        <p className="text-muted-foreground text-center text-xs">
          {t("status_label")}: {status}
        </p>
      )}
    </div>
  );
}
