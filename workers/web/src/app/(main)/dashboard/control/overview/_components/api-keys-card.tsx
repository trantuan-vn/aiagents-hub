"use client";

import { useState } from "react";

import { Copy, Eye, EyeOff, Key, Plus } from "lucide-react";

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
    toast({ title: "Copied", description: "Token prefix copied" });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t("api_keys.title")}</CardTitle>
            <CardDescription>{t("api_keys.description")}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = "/dashboard/control/token";
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("api_keys.new_key")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Key className="text-muted-foreground mb-3 h-10 w-10" />
              <p className="text-muted-foreground text-sm">{t("no_api_keys")}</p>
            </div>
          ) : (
            apiKeys.map((key) => {
              const maskedKey = `utk_${"•".repeat(12)}`;
              return (
                <div key={key.id} className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
                      <Key className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{key.name}</span>
                        <Badge variant={key.status === "active" ? "default" : "secondary"} className="text-xs">
                          {key.status === "active" ? t("api_keys.active") : t("api_keys.inactive")}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground font-mono text-xs">{maskedKey}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
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
