"use client";

import { CreditCard, Loader2 } from "lucide-react";
import type { Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { BANK_CODES } from "./payment-dialog-constants";
import type { CreatePayment } from "./schema";

interface PaymentVnpayPanelProps {
  control: Control<CreatePayment>;
  isLoading: boolean;
  cancelLabel: string;
  payNowLabel: string;
  processingLabel: string;
  bankCodeLabel: string;
  selectBankPlaceholder: string;
  bankCodeDescription: string;
  languageLabel: string;
  languageDescription: string;
  onCancel: () => void;
}

export function PaymentVnpayPanel({
  control,
  isLoading,
  cancelLabel,
  payNowLabel,
  processingLabel,
  bankCodeLabel,
  selectBankPlaceholder,
  bankCodeDescription,
  languageLabel,
  languageDescription,
  onCancel,
}: PaymentVnpayPanelProps) {
  return (
    <>
      <FormField
        control={control}
        name="bankCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{bankCodeLabel}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={selectBankPlaceholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {BANK_CODES.map((bank) => (
                  <SelectItem key={bank.value} value={bank.value}>
                    {bank.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>{bankCodeDescription}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="language"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{languageLabel}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="vn">Tiếng Việt</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>{languageDescription}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {processingLabel}
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              {payNowLabel}
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
