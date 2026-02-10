"use client";

import { useEffect, useState } from "react";

import { AlertCircle, Key, Shield } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { CreateTokenDialog } from "./_components/create-token-dialog";
import type { ApiToken, CreateApiToken } from "./_components/schema";
import { TokenList } from "./_components/token-list";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface TokenListResponse {
  tokens: ApiToken[];
}

interface CreateTokenResponse {
  apiToken: {
    createdAt: string;
    expiresAt?: string;
    id: number;
    name: string;
    permissions: string[];
  };
  rawToken: string;
}

export default function TokenPage() {
  const t = useTranslations("TokenPage");
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/token/list`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("fetch_error"));
      }

      const data: TokenListResponse = await response.json();
      setTokens(data.tokens);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateToken = async (data: CreateApiToken): Promise<CreateTokenResponse> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/token/create`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("create_error"));
    }

    const result = await response.json();
    void fetchTokens(); // Refresh the list
    return result as CreateTokenResponse;
  };

  const handleRevokeToken = async (tokenId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/token/revoke/${tokenId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("revoke_error"));
    }

    void fetchTokens(); // Refresh the list
  };

  const handleRevokeAll = async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/token/revoke-all`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("revoke_all_error"));
    }

    void fetchTokens(); // Refresh the list
  };

  const activeTokens = tokens.filter((t) => t.isActive);
  const expiredTokens = tokens.filter((t) => t.isActive && t.expiresAt && new Date(t.expiresAt) < new Date());

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <CreateTokenDialog onCreate={handleCreateToken} />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_tokens")}</CardTitle>
            <Key className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tokens.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_tokens_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.active_tokens")}</CardTitle>
            <Shield className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTokens.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.active_tokens_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.expired_tokens")}</CardTitle>
            <AlertCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiredTokens.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.expired_tokens_description")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Token List */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : (
        <TokenList tokens={tokens} onRevoke={handleRevokeToken} onRevokeAll={handleRevokeAll} />
      )}
    </div>
  );
}
