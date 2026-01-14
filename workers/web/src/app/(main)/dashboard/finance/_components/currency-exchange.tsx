"use client";

import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

function CurrencySelector(props: { defaultValue: string; t: (key: string) => string }) {
  return (
    <Select defaultValue={props.defaultValue}>
      <SelectTrigger size="sm" className="border-none shadow-none outline-none focus-visible:ring-0">
        <SelectValue placeholder={props.t("currency")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="usd">USD</SelectItem>
        <SelectItem value="eur">EUR</SelectItem>
        <SelectItem value="gbp">GBP</SelectItem>
        <SelectItem value="aed">AED</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function CurrencyExchange() {
  const t = useTranslations("Finance");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("currency_exchange")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-lg border shadow-sm">
          <div className="border-b px-4 py-2">
            <div className="flex justify-between">
              <div className="flex flex-1 justify-center">
                <CurrencySelector defaultValue="usd" t={t} />
              </div>
              <Separator orientation="vertical" className="!h-auto" />
              <div className="flex flex-1 items-center justify-center">
                <ArrowLeftRight className="text-muted-foreground size-4" />
              </div>
              <Separator orientation="vertical" className="!h-auto" />
              <div className="flex flex-1 justify-center">
                <CurrencySelector defaultValue="eur" t={t} />
              </div>
            </div>
          </div>
          <div className="space-y-2 py-6 text-center tabular-nums">
            <p className="text-4xl">{formatCurrency(100.0)}</p>
            <p className="text-muted-foreground text-xs font-medium">
              {t("available")}: <span className="text-foreground">{formatCurrency(13100.06)}</span>
            </p>
          </div>
          <div className="bg-muted border-t py-1 text-center text-xs tabular-nums">
            <span className="text-muted-foreground">1 USD = </span> 0.85 EUR
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span>{t("tax")}</span>
            <span className="font-medium tabular-nums">{formatCurrency(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("exchange_fee")}</span>
            <span className="font-medium tabular-nums">{formatCurrency(1)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("total_amount")}</span>
            <span className="font-medium">{formatCurrency(82.77, { currency: "EUR" })}</span>
          </div>
        </div>
        <Button variant="outline" className="w-full">
          <RefreshCw /> {t("exchange")}
        </Button>
      </CardContent>
    </Card>
  );
}
