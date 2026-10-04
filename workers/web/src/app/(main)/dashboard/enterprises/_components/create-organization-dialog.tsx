"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminEnterprises } from "@/lib/enterprise-admin-api";
import { useEnterpriseErrorMessage } from "@/lib/enterprise-api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
};

export function CreateOrganizationDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useTranslations("EnterpriseAdminPage");
  const errorMessage = useEnterpriseErrorMessage();
  const [name, setName] = useState("");
  const [minProSeats, setMinProSeats] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const minPro = Number(minProSeats);
  const valid = name.trim().length > 0 && Number.isInteger(minPro) && minPro >= 0;

  const submit = async () => {
    setBusy(true);
    try {
      const { enterprise } = await adminEnterprises.create({
        name: name.trim(),
        minProSeats: minPro,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t("created"));
      setName("");
      setMinProSeats("1");
      setNote("");
      onOpenChange(false);
      onCreated(enterprise.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create_organization")}</DialogTitle>
          <DialogDescription>{t("create_description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">{t("field_name")}</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-min-pro">{t("field_min_pro")}</Label>
            <Input
              id="org-min-pro"
              type="number"
              min={0}
              step={1}
              value={minProSeats}
              onChange={(e) => setMinProSeats(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("field_min_pro_hint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-note">{t("field_note")}</Label>
            <Textarea id="org-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || busy}>
            {busy ? t("saving") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
