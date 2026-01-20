"use client";

import { useState } from "react";

import { Calendar, Copy, Eye, EyeOff, Key, Shield, Trash2 } from "lucide-react";
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

import type { ApiToken } from "./schema";

interface TokenListProps {
  tokens: ApiToken[];
  onRevoke: (tokenId: number) => Promise<void>;
  onRevokeAll: () => Promise<void>;
}

export function TokenList({ tokens, onRevoke, onRevokeAll }: TokenListProps) {
  const t = useTranslations("TokenPage");
  const { toast } = useToast();
  const [showToken, setShowToken] = useState<number | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<number | null>(null);

  const copyToClipboard = (text: string): void => {
    void navigator.clipboard.writeText(text);
    toast({
      title: t("token_copied"),
      description: t("token_copied_description"),
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t("api_tokens")}</CardTitle>
            <CardDescription>{t("api_tokens_description")}</CardDescription>
          </div>
          {tokens.length > 0 && (
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
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tokens.map((token) => {
            const expired = isExpired(token.expiresAt);
            const maskedToken = `utk_${"•".repeat(32)}`;

            return (
              <div
                key={token.id}
                className="bg-muted/50 flex items-center justify-between rounded-lg p-4"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                    <Key className="text-primary h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{token.name}</span>
                      <Badge
                        variant={
                          !token.isActive
                            ? "secondary"
                            : expired
                              ? "destructive"
                              : "default"
                        }
                        className="text-xs"
                      >
                        {!token.isActive
                          ? t("inactive")
                          : expired
                            ? t("expired")
                            : t("active")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {token.expiresAt
                          ? formatDate(token.expiresAt)
                          : t("never_expires")}
                      </div>
                      {token.permissions.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {token.permissions.length} {t("permissions")}
                        </div>
                      )}
                    </div>
                    <p className="text-muted-foreground font-mono text-xs mt-1">{maskedToken}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken(showToken === token.id ? null : token.id)}
                  >
                    {showToken === token.id ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(maskedToken)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
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
  );
}
