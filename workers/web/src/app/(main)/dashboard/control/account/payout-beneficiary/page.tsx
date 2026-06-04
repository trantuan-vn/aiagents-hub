"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";

import { ArrowLeft, ImagePlus, Landmark, Loader2, X } from "lucide-react";
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

const bankFormSchema = z.object({
  bankBin: z.string().min(6, "Select a bank"),
  accountNo: z.string().min(8).max(20),
  accountName: z.string().min(1).max(100),
});

const paypalFormSchema = z.object({
  paypalEmail: z.string().email().max(254),
});

type BankForm = z.infer<typeof bankFormSchema>;
type PaypalForm = z.infer<typeof paypalFormSchema>;

export default function PayoutBeneficiaryPage() {
  const t = useTranslations("AccountPage.payout_beneficiary");
  const { toast } = useToast();
  const [banks, setBanks] = useState<VietQrBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [payoutCurrency, setPayoutCurrency] = useState<"VND" | "USD">("VND");
  const [paypalQrFile, setPaypalQrFile] = useState<File | null>(null);
  const [paypalQrPreview, setPaypalQrPreview] = useState<string | null>(null);
  const [existingPaypalQr, setExistingPaypalQr] = useState(false);

  const bankForm = useForm<BankForm>({
    resolver: zodResolver(bankFormSchema),
    defaultValues: { bankBin: "", accountNo: "", accountName: "" },
  });

  const paypalForm = useForm<PaypalForm>({
    resolver: zodResolver(paypalFormSchema),
    defaultValues: { paypalEmail: "" },
  });

  const selectedBin = bankForm.watch("bankBin");
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

  const loadProfileAndBeneficiary = useCallback(
    async (bankList: VietQrBank[]) => {
      try {
        const [beneficiaryRes, profileRes] = await Promise.all([
          fetch(`${API_BASE_URL}/dashboard/payout/beneficiary`, {
            method: "GET",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          }),
          fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, { credentials: "include" }),
        ]);

        if (profileRes.ok) {
          const profile: { earningsPayoutCurrency?: string } = await profileRes.json();
          setPayoutCurrency(profile.earningsPayoutCurrency === "USD" ? "USD" : "VND");
        }

        if (!beneficiaryRes.ok) return;
        const data: {
          beneficiary?: { accountNo?: string; accountName?: string; acqId?: string } | null;
          paypal?: { paypalEmail?: string; hasPaypalQr?: boolean } | null;
        } = await beneficiaryRes.json();

        if (data.paypal?.paypalEmail) {
          paypalForm.reset({ paypalEmail: data.paypal.paypalEmail });
        }
        if (data.paypal?.hasPaypalQr) {
          setExistingPaypalQr(true);
          try {
            const qrRes = await fetch(`${API_BASE_URL}/dashboard/payout/beneficiary/paypal/qr`, {
              credentials: "include",
            });
            if (qrRes.ok) {
              const qrData: { qr?: string | null } = await qrRes.json();
              if (qrData.qr) setPaypalQrPreview(qrData.qr);
            }
          } catch {
            /* ignore */
          }
        }

        if (!data.beneficiary?.accountNo) return;
        const bin = data.beneficiary.acqId ?? "";
        const matched = findBankByBin(bankList, bin);
        bankForm.reset({
          bankBin: matched?.bin ?? bin,
          accountNo: data.beneficiary.accountNo,
          accountName: data.beneficiary.accountName ?? "",
        });
      } catch {
        /* ignore */
      }
    },
    [bankForm, paypalForm],
  );

  useEffect(() => {
    void (async () => {
      const list = await loadBanks();
      await loadProfileAndBeneficiary(list);
      setProfileLoading(false);
    })();
  }, [loadBanks, loadProfileAndBeneficiary]);

  const onSubmitBank = async (values: BankForm) => {
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

  const onPaypalQrSelect = (file: File | null) => {
    setPaypalQrFile(file);
    if (paypalQrPreview?.startsWith("blob:")) URL.revokeObjectURL(paypalQrPreview);
    if (!file) {
      if (!existingPaypalQr) setPaypalQrPreview(null);
      return;
    }
    if (!file.type.match(/^image\/(jpeg|png)$/)) {
      toast({ title: t("error"), description: t("paypal_qr_invalid_type"), variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t("error"), description: t("paypal_qr_too_large"), variant: "destructive" });
      return;
    }
    setPaypalQrPreview(URL.createObjectURL(file));
  };

  const onSubmitPaypal = async (values: PaypalForm) => {
    if (!paypalQrFile && !existingPaypalQr) {
      toast({ title: t("error"), description: t("paypal_qr_required"), variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const form = new FormData();
      form.append("paypalEmail", values.paypalEmail.trim());
      if (paypalQrFile) form.append("paypalQrImage", paypalQrFile);
      const res = await fetch(`${API_BASE_URL}/dashboard/payout/beneficiary/paypal`, {
        method: "PUT",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || t("save_error"));
      }
      setExistingPaypalQr(true);
      setPaypalQrFile(null);
      toast({ title: t("saved"), description: t("paypal_saved_description") });
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
  const isUsd = payoutCurrency === "USD";

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
            {isUsd ? t("register_paypal_title") : t("register_title")}
          </CardTitle>
          <CardDescription>{isUsd ? t("register_paypal_description") : t("register_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {pageLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("loading")}
            </div>
          ) : isUsd ? (
            <Form {...paypalForm}>
              <form onSubmit={(e) => void paypalForm.handleSubmit(onSubmitPaypal)(e)} className="space-y-5">
                <FormField
                  control={paypalForm.control}
                  name="paypalEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("paypal_email")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="you@example.com" autoComplete="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>{t("paypal_qr_image")}</FormLabel>
                  <div className="space-y-3">
                    {paypalQrPreview ? (
                      <div className="relative inline-block">
                        <Image
                          src={paypalQrPreview}
                          alt=""
                          width={200}
                          height={200}
                          unoptimized
                          className="border-input max-h-[200px] rounded-lg border object-contain"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute -top-2 -right-2 h-7 w-7 rounded-full"
                          onClick={() => {
                            onPaypalQrSelect(null);
                            setExistingPaypalQr(false);
                            setPaypalQrPreview(null);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                    <div>
                      <Input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        id="paypal-qr-upload"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          onPaypalQrSelect(f);
                          e.target.value = "";
                        }}
                      />
                      <Button type="button" variant="outline" size="sm" asChild>
                        <label htmlFor="paypal-qr-upload" className="cursor-pointer">
                          <ImagePlus className="mr-2 h-4 w-4" />
                          {paypalQrPreview ? t("paypal_qr_change") : t("paypal_qr_upload")}
                        </label>
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">{t("paypal_qr_hint")}</p>
                  </div>
                </FormItem>
                <p className="text-muted-foreground text-xs">{t("paypal_hint")}</p>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? t("saving") : t("save")}
                </Button>
              </form>
            </Form>
          ) : banksError ? (
            <div className="space-y-4">
              <p className="text-destructive text-sm">{banksError}</p>
              <Button variant="outline" onClick={() => void loadBanks()}>
                {t("retry_banks")}
              </Button>
            </div>
          ) : (
            <Form {...bankForm}>
              <form onSubmit={(e) => void bankForm.handleSubmit(onSubmitBank)(e)} className="space-y-5">
                <FormField
                  control={bankForm.control}
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
                  control={bankForm.control}
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
                  control={bankForm.control}
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
