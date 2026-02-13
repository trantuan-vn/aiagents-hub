"use client";

import { format } from "date-fns";
import { Unlink } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DidStatus {
  enabled: boolean;
  did?: string;
  method?: string;
  linkedAt?: string;
}

export function DidLinkedContent({
  status,
  showUnlinkConfirm,
  setShowUnlinkConfirm,
  unlinking,
  onUnlink,
  t,
}: {
  status: DidStatus;
  showUnlinkConfirm: boolean;
  setShowUnlinkConfirm: (v: boolean) => void;
  unlinking: boolean;
  onUnlink: () => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  console.log("[did] DidLinkedContent render", { status, showUnlinkConfirm, unlinking });
  return (
    <div className="space-y-4">
      <div className="bg-muted/30 rounded-lg border px-4 py-3">
        <p className="text-muted-foreground mb-1 text-xs font-medium">{t("your_did")}</p>
        <p className="font-mono text-sm break-all">{status.did}</p>
        {status.linkedAt && (
          <p className="text-muted-foreground mt-2 text-xs">
            {t("linked_at", { date: format(new Date(status.linkedAt), "PPp") })}
          </p>
        )}
      </div>
      <AlertDialog open={showUnlinkConfirm} onOpenChange={setShowUnlinkConfirm}>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            console.log("[did] Unlink confirm clicked");
            setShowUnlinkConfirm(true);
          }}
          disabled={unlinking}
        >
          <Unlink className="mr-2 h-4 w-4" />
          {unlinking ? t("unlinking") : t("unlink")}
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("unlink_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("unlink_confirm_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                console.log("[did] Unlink confirmed, calling onUnlink");
                void onUnlink();
              }}
            >
              {t("unlink")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
