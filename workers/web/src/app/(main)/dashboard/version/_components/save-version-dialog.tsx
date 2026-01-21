"use client";

import { useState } from "react";

import { Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

import type { VersionSaveResponse } from "./schema";

interface SaveVersionDialogProps {
  onSave: () => Promise<VersionSaveResponse>;
}

export function SaveVersionDialog({ onSave }: SaveVersionDialogProps) {
  const t = useTranslations("VersionPage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      const result = await onSave();
      toast({
        title: t("version_saved"),
        description: t("version_saved_description", { version: result.version }),
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("save_error"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Download className="mr-2 h-4 w-4" />
          {t("save_version")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("save_version")}</DialogTitle>
          <DialogDescription>{t("save_version_description")}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-muted-foreground text-sm">{t("save_version_warning")}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {t("saving")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t("save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
