"use client";

import { KeyRound, MessageSquare, ShieldCheck, Key } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function AccountSecurityCard() {
  const t = useTranslations("AccountPage.security");

  const methods = [
    {
      key: "authenticator",
      icon: KeyRound,
      titleKey: "authenticator_title",
      descKey: "authenticator_desc",
      status: "optional",
      actionKey: "setup",
    },
    {
      key: "sms",
      icon: MessageSquare,
      titleKey: "sms_title",
      descKey: "sms_desc",
      status: "optional",
      actionKey: "enable",
    },
    {
      key: "passkey",
      icon: ShieldCheck,
      titleKey: "passkey_title",
      descKey: "passkey_desc",
      status: "optional",
      actionKey: "add",
    },
    {
      key: "backup_codes",
      icon: Key,
      titleKey: "backup_codes_title",
      descKey: "backup_codes_desc",
      status: "optional",
      actionKey: "generate",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {methods.map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={m.key}>
              {i > 0 && <Separator className="my-4" />}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="text-muted-foreground h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t(m.titleKey)}</span>
                      <Badge variant="secondary" className="text-xs">
                        {t("optional")}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">{t(m.descKey)}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0">
                  {t(m.actionKey)}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
