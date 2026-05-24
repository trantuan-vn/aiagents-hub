"use client";

import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { MembershipTier } from "../../voucher/_components/schema";
import { getMembershipTierLabel } from "../../voucher/_components/voucher-display-utils";

import { ALL_MEMBERSHIP_TIERS, type CommissionPolicyFormValues } from "./schema";

interface CommissionPolicyFormFieldsProps {
  form: UseFormReturn<CommissionPolicyFormValues>;
  applicableTo: CommissionPolicyFormValues["applicableTo"];
  codeDisabled?: boolean;
}

export function CommissionPolicyFormFields({
  form,
  applicableTo,
  codeDisabled = false,
}: CommissionPolicyFormFieldsProps) {
  const t = useTranslations("CommissionPolicyPage");

  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("name")}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("code")}</FormLabel>
            <FormControl>
              <Input {...field} disabled={codeDisabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="commissionPercent"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("commission_percent")}</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={0}
                max={100}
                {...field}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="applicableTo"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("applicable_to")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ALL">{t("all_users")}</SelectItem>
                <SelectItem value="USER_GROUP">{t("user_group")}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      {applicableTo === "USER_GROUP" ? (
        <FormField
          control={form.control}
          name="membershipTiers"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("membership_tiers")}</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MEMBERSHIP_TIERS.map((tier) => {
                  const checked = (field.value ?? []).includes(tier);
                  return (
                    <label key={tier} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          const current = field.value ?? [];
                          field.onChange(
                            next
                              ? [...current, tier]
                              : current.filter((item: MembershipTier) => item !== tier),
                          );
                        }}
                      />
                      {getMembershipTierLabel(tier)}
                    </label>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
      <FormField
        control={form.control}
        name="effectiveFrom"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("effective_from")}</FormLabel>
            <FormControl>
              <Input type="datetime-local" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="effectiveTo"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("effective_to")}</FormLabel>
            <FormControl>
              <Input type="datetime-local" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("status")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ACTIVE">{t("status_active")}</SelectItem>
                <SelectItem value="INACTIVE">{t("status_inactive")}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
