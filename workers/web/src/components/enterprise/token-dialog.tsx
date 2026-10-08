"use client";

import { Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enterpriseHookUrl } from "@/lib/enterprise-api";

export type IssuedToken = { token: string; label: string; grantee?: string; bodyJson?: string };

/** Plaintext tokens exist only in this dialog's props; closing it drops them. */
export function TokenDialog({ tokens, onClose }: { tokens: IssuedToken[]; onClose: () => void }) {
  const t = useTranslations("Enterprise.token");

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  return (
    <Dialog open={tokens.length > 0} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertDescription>{t("once_warning")}</AlertDescription>
        </Alert>
        <div className="space-y-4">
          {tokens.map((item) => {
            const url = enterpriseHookUrl(item.token);
            const payload = item.bodyJson ?? '{"message":"hello"}';
            const curl = `curl -X POST -H 'Content-Type: application/json' -d '${payload.replaceAll("'", `'\\''`)}' ${url}`;
            return (
              <div key={item.token} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {item.label}
                  {item.grantee ? <span className="text-muted-foreground font-normal"> · {item.grantee}</span> : null}
                </p>
                <div className="flex items-center gap-2">
                  <code className="bg-muted flex-1 overflow-x-auto rounded px-2 py-1 text-xs whitespace-nowrap">
                    {url}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => void copy(url)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {t("copy_url")}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="bg-muted flex-1 overflow-x-auto rounded px-2 py-1 text-xs whitespace-nowrap">
                    {curl}
                  </code>
                  <Button size="sm" variant="ghost" onClick={() => void copy(curl)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
