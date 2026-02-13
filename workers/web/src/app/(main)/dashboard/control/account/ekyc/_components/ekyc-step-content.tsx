/* eslint-disable max-lines */
"use client";

import { useCallback, useRef } from "react";

import { Camera, CheckCircle2, FileUp, ShieldCheck, Trash2, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export type EkycStep = "document" | "face" | "success";

export type DocType = "passport" | "cccd";

interface EkycStepContentProps {
  step: EkycStep;
  status: string | null;
  documentFile: File | null;
  documentBackFile: File | null;
  docType: DocType;
  selfieFile: File | null;
  faceImages: File[];
  submitting: boolean;
  removing: boolean;
  verifyTesting: boolean;
  onDocumentSelect: (file: File) => void;
  onDocumentBackSelect: (file: File | null) => void;
  onDocTypeChange: (t: DocType) => void;
  onSelfieSelect: (file: File) => void;
  onFaceImagesSelect: (files: File[]) => void;
  onSubmitDocument: () => void;
  onSubmitFace: () => void;
  onRemoveEkyc: () => void;
  onVerifyTest: (file: File) => void;
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
  docType,
  documentFile,
  documentBackFile,
  submitting,
  docInputRef,
  docBackInputRef,
  onDocTypeChange,
  onDocChange,
  onDocBackChange,
  onSubmitDocument,
  t,
}: {
  docType: DocType;
  documentFile: File | null;
  documentBackFile: File | null;
  submitting: boolean;
  docInputRef: React.RefObject<HTMLInputElement>;
  docBackInputRef: React.RefObject<HTMLInputElement>;
  onDocTypeChange: (t: DocType) => void;
  onDocChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDocBackChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmitDocument: () => void;
  t: EkycStepContentProps["t"];
}) {
  const canSubmit = docType === "passport" ? !!documentFile : !!documentFile && !!documentBackFile;
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-4 pt-6">
        <p className="text-muted-foreground text-sm">{t("document_hint")}</p>
        <RadioGroup
          value={docType}
          onValueChange={(v) => (v === "passport" || v === "cccd") && onDocTypeChange(v)}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="passport" id="passport" />
            <Label htmlFor="passport">{t("doc_type_passport")}</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="cccd" id="cccd" />
            <Label htmlFor="cccd">{t("doc_type_cccd")}</Label>
          </div>
        </RadioGroup>
        <div>
          <p className="text-muted-foreground mb-2 text-xs">
            {docType === "passport" ? t("doc_passport_hint") : t("doc_cccd_front_hint")}
          </p>
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
        </div>
        {docType === "cccd" && (
          <div>
            <p className="text-muted-foreground mb-2 text-xs">{t("doc_cccd_back_hint")}</p>
            <input
              ref={docBackInputRef}
              type="file"
              accept={ACCEPT_IMAGE}
              className="hidden"
              onChange={onDocBackChange}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => docBackInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && docBackInputRef.current?.click()}
              className={dropZoneClass}
            >
              {documentBackFile ? (
                <>
                  <CheckCircle2 className="text-muted-foreground h-10 w-10" />
                  <span className="text-sm font-medium">{documentBackFile.name}</span>
                  <span className="text-muted-foreground text-xs">
                    ({(documentBackFile.size / 1024).toFixed(1)} KB)
                  </span>
                </>
              ) : (
                <>
                  <FileUp className="text-muted-foreground h-10 w-10" />
                  <span className="text-sm">{t("document_upload")}</span>
                  <span className="text-muted-foreground text-xs">{t("document_formats")}</span>
                </>
              )}
            </div>
          </div>
        )}
        <Button className="w-full" disabled={!canSubmit || submitting} onClick={onSubmitDocument}>
          {submitting ? t("processing") : t("submit_document")}
        </Button>
      </CardContent>
    </Card>
  );
}

function FaceStepBlock({
  selfieFile,
  faceImages,
  submitting,
  selfieInputRef,
  faceImagesInputRef,
  onSelfieChange,
  onFaceImagesChange,
  onSubmitFace,
  t,
}: {
  selfieFile: File | null;
  faceImages: File[];
  submitting: boolean;
  selfieInputRef: React.RefObject<HTMLInputElement>;
  faceImagesInputRef: React.RefObject<HTMLInputElement>;
  onSelfieChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFaceImagesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmitFace: () => void;
  t: EkycStepContentProps["t"];
}) {
  const hasMedia = !!selfieFile || faceImages.length > 0;
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-4 pt-6">
        <p className="text-muted-foreground text-sm">{t("face_hint")}</p>
        <p className="text-muted-foreground text-xs">{t("face_hint_detail")}</p>
        <div>
          <p className="text-muted-foreground mb-2 text-xs">{t("face_single_or_multi")}</p>
          <input ref={selfieInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={onSelfieChange} />
          <input
            ref={faceImagesInputRef}
            type="file"
            accept={ACCEPT_IMAGE}
            multiple
            className="hidden"
            onChange={onFaceImagesChange}
          />
          <div className="flex gap-2">
            <div
              role="button"
              tabIndex={0}
              onClick={() => selfieInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && selfieInputRef.current?.click()}
              className={cn(dropZoneClass, "flex-1")}
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
                </>
              )}
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => faceImagesInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && faceImagesInputRef.current?.click()}
              className={cn(dropZoneClass, "flex-1")}
            >
              {faceImages.length > 0 ? (
                <>
                  <Video className="text-muted-foreground h-10 w-10" />
                  <span className="text-sm font-medium">
                    {faceImages.length} {t("face_images_count")}
                  </span>
                </>
              ) : (
                <>
                  <Video className="text-muted-foreground h-10 w-10" />
                  <span className="text-sm">{t("face_images_upload")}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Button className="w-full" disabled={!hasMedia || submitting} onClick={onSubmitFace}>
          {submitting ? t("processing") : t("submit_face")}
        </Button>
      </CardContent>
    </Card>
  );
}

function SuccessBlock({
  t,
  onRemoveEkyc,
  onVerifyTest,
  removing,
  verifyTesting,
  verifyTestInputRef,
}: {
  t: EkycStepContentProps["t"];
  onRemoveEkyc: () => void;
  onVerifyTest: (file: File) => void;
  removing: boolean;
  verifyTesting: boolean;
  verifyTestInputRef: React.RefObject<HTMLInputElement>;
}) {
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
        <div className="flex w-full flex-col gap-2">
          <input
            ref={verifyTestInputRef}
            type="file"
            accept={ACCEPT_IMAGE}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && validateFile(f) === null) onVerifyTest(f);
            }}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={verifyTesting}
            onClick={() => verifyTestInputRef.current?.click()}
          >
            {verifyTesting ? t("processing") : t("verify_test")}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive w-full"
            disabled={removing}
            onClick={onRemoveEkyc}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {removing ? t("processing") : t("remove_ekyc")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EkycStepContent({
  step,
  status,
  documentFile,
  documentBackFile,
  docType,
  selfieFile,
  faceImages,
  submitting,
  removing,
  verifyTesting,
  onDocumentSelect,
  onDocumentBackSelect,
  onDocTypeChange,
  onSelfieSelect,
  onFaceImagesSelect,
  onSubmitDocument,
  onSubmitFace,
  onRemoveEkyc,
  onVerifyTest,
  t,
}: EkycStepContentProps) {
  const docInputRef = useRef<HTMLInputElement>(null);
  const docBackInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const faceImagesInputRef = useRef<HTMLInputElement>(null);
  const verifyTestInputRef = useRef<HTMLInputElement>(null);

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

  const handleDocBackChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) {
        onDocumentBackSelect(null);
        return;
      }
      const err = validateFile(f);
      if (err) return;
      onDocumentBackSelect(f);
    },
    [onDocumentBackSelect],
  );

  const handleSelfieChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const err = validateFile(f);
      if (err) return;
      onSelfieSelect(f);
      onFaceImagesSelect([]);
    },
    [onSelfieSelect, onFaceImagesSelect],
  );

  const handleFaceImagesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      const valid = files.filter((f) => validateFile(f) === null);
      if (valid.length > 0) {
        onFaceImagesSelect(valid);
        onSelfieSelect(valid[0]);
      }
    },
    [onFaceImagesSelect, onSelfieSelect],
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
          docType={docType}
          documentFile={documentFile}
          documentBackFile={documentBackFile}
          submitting={submitting}
          docInputRef={docInputRef}
          docBackInputRef={docBackInputRef}
          onDocTypeChange={onDocTypeChange}
          onDocChange={handleDocChange}
          onDocBackChange={handleDocBackChange}
          onSubmitDocument={onSubmitDocument}
          t={t}
        />
      )}

      {step === "face" && (
        <FaceStepBlock
          selfieFile={selfieFile}
          faceImages={faceImages}
          submitting={submitting}
          selfieInputRef={selfieInputRef}
          faceImagesInputRef={faceImagesInputRef}
          onSelfieChange={handleSelfieChange}
          onFaceImagesChange={handleFaceImagesChange}
          onSubmitFace={onSubmitFace}
          t={t}
        />
      )}

      {step === "success" && (
        <SuccessBlock
          t={t}
          onRemoveEkyc={onRemoveEkyc}
          onVerifyTest={onVerifyTest}
          removing={removing}
          verifyTesting={verifyTesting}
          verifyTestInputRef={verifyTestInputRef}
        />
      )}

      {status && (
        <p className="text-muted-foreground text-center text-xs">
          {t("status_label")}: {status}
        </p>
      )}
    </div>
  );
}
