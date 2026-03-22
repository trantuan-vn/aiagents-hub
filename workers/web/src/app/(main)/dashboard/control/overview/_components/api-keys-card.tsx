"use client";

import { useState } from "react";

import Link from "next/link";

import { Copy, Eye, EyeOff, Key, Plus, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface ApiKey {
  id: number;
  name: string;
  status: "active" | "inactive";
}

interface ApiKeysCardProps {
  apiKeys: ApiKey[];
  t: (key: string) => string;
}

export function ApiKeysCard({ apiKeys, t }: ApiKeysCardProps) {
  const { toast } = useToast();
  const [showKey, setShowKey] = useState<number | null>(null);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: t("api_keys.copied"), description: t("api_keys.copied_desc") });
  };

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="text-primary h-5 w-5" />
              {t("api_keys.title")}
            </CardTitle>
            <CardDescription>{t("api_keys.description")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/control/token" className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("api_keys.new_key")}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10">
              <div className="bg-muted/50 mb-3 flex h-12 w-12 items-center justify-center rounded-full">
                <Key className="text-muted-foreground h-6 w-6" />
              </div>
              <p className="text-muted-foreground mb-4 text-sm">{t("no_api_keys")}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/control/token" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t("api_keys.create_first")}
                </Link>
              </Button>
            </div>
          ) : (
            apiKeys.map((key) => {
              const maskedKey = `utk_${"•".repeat(12)}`;
              return (
                <div
                  key={key.id}
                  className="bg-muted/20 hover:bg-muted/40 flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                      <Key className="text-primary h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{key.name}</span>
                        <Badge variant={key.status === "active" ? "default" : "secondary"} className="text-xs">
                          {key.status === "active" ? t("api_keys.active") : t("api_keys.inactive")}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground font-mono text-xs">{maskedKey}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setShowKey(showKey === key.id ? null : key.id)}>
                      {showKey === key.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(maskedKey)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
