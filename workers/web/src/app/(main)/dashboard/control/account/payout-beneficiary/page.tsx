"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Landmark, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fetchVietQrBanks, findBankByBin, type VietQrBank } from "@/lib/vietqr-banks";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

const formSchema = z.object({
  bankBin: z.string().min(6, "Select a bank"),
  accountNo: z.string().min(8).max(20),
  accountName: z.string().min(1).max(100),
});

type BeneficiaryForm = z.infer<typeof formSchema>;

export default function PayoutBeneficiaryPage() {
  const t = useTranslations("AccountPage.payout_beneficiary");
  const { toast } = useToast();
  const [banks, setBanks] = useState<VietQrBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<BeneficiaryForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { bankBin: "", accountNo: "", accountName: "" },
  });

  const selectedBin = form.watch("bankBin");
  const selectedBank = findBankByBin(banks, selectedBin);

  const loadBanks = useCallback(async () => {
    setBanksLoading(true);
    setBanksError(null);
    try {
      const list = await fetchVietQrBanks();
      setBanks(list);
      return list;
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("banks_load_error");
      setBanksError(msg);
      return [];
    } finally {
      setBanksLoading(false);
    }
  }, [t]);

  const loadBeneficiary = useCallback(
    async (bankList: VietQrBank[]) => {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/payout/beneficiary`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return;
        const data: {
          beneficiary?: { accountNo?: string; accountName?: string; acqId?: string } | null;
        } = await res.json();
        if (!data.beneficiary?.accountNo) return;
        const bin = data.beneficiary.acqId ?? "";
        const matched = findBankByBin(bankList, bin);
        form.reset({
          bankBin: matched?.bin ?? bin,
          accountNo: data.beneficiary.accountNo,
          accountName: data.beneficiary.accountName ?? "",
        });
      } catch {
        /* ignore */
      }
    },
    [form],
  );

  useEffect(() => {
    void (async () => {
      const list = await loadBanks();
      await loadBeneficiary(list);
      setProfileLoading(false);
    })();
  }, [loadBanks, loadBeneficiary]);

  const onSubmit = async (values: BeneficiaryForm) => {
    const bank = findBankByBin(banks, values.bankBin);
    if (!bank) {
      toast({ title: t("error"), description: t("bank_required"), variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/payout/beneficiary`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNo: values.accountNo.trim(),
          accountName: values.accountName.trim().toUpperCase(),
          acqId: bank.bin,
          bankName: bank.shortName,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || t("save_error"));
      }
      toast({ title: t("saved"), description: t("saved_description") });
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("save_error"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const pageLoading = banksLoading || profileLoading;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/dashboard/control/account">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("back_to_account")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            {t("register_title")}
          </CardTitle>
          <CardDescription>{t("register_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {pageLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("loading")}
            </div>
          ) : banksError ? (
            <div className="space-y-4">
              <p className="text-destructive text-sm">{banksError}</p>
              <Button variant="outline" onClick={() => void loadBanks()}>
                {t("retry_banks")}
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="bankBin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("select_bank")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t("select_bank_placeholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[320px]">
                          {banks.map((bank) => (
                            <SelectItem key={bank.bin} value={bank.bin}>
                              <span className="flex items-center gap-2">
                                {bank.logo ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- VietQR CDN; not in next/image remotePatterns
                                  <img src={bank.logo} alt="" width={24} height={24} className="rounded-sm object-contain" />
                                ) : null}
                                <span>
                                  {bank.shortName}
                                  <span className="text-muted-foreground ml-1 text-xs">({bank.bin})</span>
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedBank && (
                  <div className="bg-muted/50 space-y-2 rounded-lg border p-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("bank_name")}</span>
                      <span className="font-medium">{selectedBank.shortName}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("acq_id")}</span>
                      <span className="font-mono">{selectedBank.bin}</span>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="accountNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("account_no")}</FormLabel>
                      <FormControl>
                        <Input {...field} inputMode="numeric" placeholder="0912345678" disabled={!selectedBank} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("account_name")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="NGUYEN VAN A"
                          disabled={!selectedBank}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={isSaving || !selectedBank}>
                  {isSaving ? t("saving") : t("save")}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
