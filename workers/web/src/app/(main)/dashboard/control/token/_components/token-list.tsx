"use client";

import { useState } from "react";

import { Calendar, Copy, Eye, Key, Pencil, Shield, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { EditTokenDialog } from "./edit-token-dialog";
import type { ApiToken } from "./schema";
import { TokenDetailDialog } from "./token-detail-dialog";

interface TokenListProps {
  tokens: ApiToken[];
  onRevoke: (tokenId: number) => Promise<void>;
  onRevokeAll: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

function buildTokenReference(token: ApiToken): string {
  const lines = [
    `Token: ${token.name}`,
    `ID: ${token.id}`,
    `Status: ${token.isActive ? "active" : "inactive"}`,
    `Expires: ${token.expiresAt ?? "never"}`,
    `Permissions:`,
    ...(token.permissions.length > 0 ? token.permissions.map((p) => `  - ${p}`) : ["  (none)"]),
    "",
    "Secret: [hidden — only shown once at creation]",
  ];
  return lines.join("\n");
}

export function TokenList({ tokens, onRevoke, onRevokeAll, onRefresh }: TokenListProps) {
  const t = useTranslations("TokenPage");
  const { toast } = useToast();
  const [revokingTokenId, setRevokingTokenId] = useState<number | null>(null);
  const [detailToken, setDetailToken] = useState<ApiToken | null>(null);
  const [editToken, setEditToken] = useState<ApiToken | null>(null);

  const copyReference = (token: ApiToken): void => {
    void navigator.clipboard.writeText(buildTokenReference(token));
    toast({
      title: t("token_ref_copied"),
      description: t("token_ref_copied_description"),
    });
  };

  const handleRevoke = async (tokenId: number): Promise<void> => {
    setRevokingTokenId(tokenId);
    try {
      await onRevoke(tokenId);
      toast({
        title: t("token_revoked"),
        description: t("token_revoked_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("revoke_error"),
        variant: "destructive",
      });
    } finally {
      setRevokingTokenId(null);
    }
  };

  const handleRevokeAll = async (): Promise<void> => {
    try {
      await onRevokeAll();
      toast({
        title: t("all_tokens_revoked"),
        description: t("all_tokens_revoked_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("revoke_all_error"),
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const isExpired = (expiresAt: string | null | undefined): boolean => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (tokens.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Key className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-center">{t("no_tokens")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("api_tokens")}</CardTitle>
              <CardDescription>{t("api_tokens_description")}</CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="mr-1 h-4 w-4" />
                  {t("revoke_all")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("revoke_all_confirm_title")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("revoke_all_confirm_description")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevokeAll}>{t("confirm")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tokens.map((token) => {
              const expired = isExpired(token.expiresAt);
              const canEdit = token.isActive && !expired;

              return (
                <div key={token.id} className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                      <Key className="text-primary h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{token.name}</span>
                        <Badge
                          variant={!token.isActive ? "secondary" : expired ? "destructive" : "default"}
                          className="text-xs"
                        >
                          {!token.isActive ? t("inactive") : expired ? t("expired") : t("active")}
                        </Badge>
                        <span className="text-muted-foreground font-mono text-[10px]">ID {token.id}</span>
                      </div>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {token.expiresAt ? formatDate(token.expiresAt) : t("never_expires")}
                        </div>
                        {token.permissions.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            {token.permissions.length} {t("permissions")}
                          </div>
                        )}
                      </div>
                      {token.permissions.length > 0 ? (
                        <div className="mt-2 flex max-h-14 flex-wrap gap-1 overflow-hidden">
                          {token.permissions.slice(0, 4).map((perm) => (
                            <Badge key={perm} variant="outline" className="max-w-[180px] truncate font-mono text-[10px] font-normal">
                              {perm}
                            </Badge>
                          ))}
                          {token.permissions.length > 4 ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              +{token.permissions.length - 4}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("view_token")}
                      aria-label={t("view_token")}
                      onClick={() => setDetailToken(token)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("edit_token")}
                      aria-label={t("edit_token")}
                      disabled={!canEdit}
                      onClick={() => setEditToken(token)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("copy_token_ref")}
                      aria-label={t("copy_token_ref")}
                      onClick={() => copyReference(token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("revoke")}
                          aria-label={t("revoke")}
                          disabled={revokingTokenId === token.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("revoke_token_confirm_title")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("revoke_token_confirm_description", { name: token.name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRevoke(token.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t("revoke")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <TokenDetailDialog
        token={detailToken}
        open={detailToken !== null}
        onOpenChange={(open) => !open && setDetailToken(null)}
      />
      <EditTokenDialog
        token={editToken}
        open={editToken !== null}
        onOpenChange={(open) => !open && setEditToken(null)}
        onUpdated={onRefresh}
      />
    </>
  );
}
