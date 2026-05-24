"use client";

import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { CreateVoucher, MembershipTier } from "./schema";
import { getMembershipTierLabel } from "./voucher-display-utils";

const ALL_TIERS: MembershipTier[] = ["member", "silver", "gold", "diamond"];

interface CreateVoucherFormFieldsProps {
  form: UseFormReturn<CreateVoucher>;
  applicableTo: CreateVoucher["applicableTo"];
  isSubmitting: boolean;
  onCancel: () => void;
}

export function CreateVoucherFormFields({
  form,
  applicableTo,
  isSubmitting,
  onCancel,
}: CreateVoucherFormFieldsProps) {
  const t = useTranslations("VoucherPage");

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.code")}</FormLabel>
              <FormControl>
                <Input placeholder={t("form.code_placeholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.name")}</FormLabel>
              <FormControl>
                <Input placeholder={t("form.name_placeholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="discountPercent"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("form.discount_percent")}</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder={t("form.discount_value_placeholder")}
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
            <FormLabel>{t("form.applicable_to")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t("form.applicable_to_placeholder")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ALL">{t("form.applicable_all")}</SelectItem>
                <SelectItem value="GROUPS">{t("form.applicable_groups")}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {applicableTo === "GROUPS" ? (
        <FormField
          control={form.control}
          name="membershipTiers"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.membership_tiers")}</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                {ALL_TIERS.map((tier) => {
                  const checked = (field.value ?? []).includes(tier);
                  return (
                    <label key={tier} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          const current = field.value ?? [];
                          field.onChange(
                            next ? [...current, tier] : current.filter((item: MembershipTier) => item !== tier),
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

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="minOrderAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.min_order_amount")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder={t("form.min_order_amount_placeholder")}
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxDiscountAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.max_discount_amount")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder={t("form.max_discount_amount_placeholder")}
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="usageLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.usage_limit")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder={t("form.usage_limit_placeholder")}
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                />
              </FormControl>
              <FormDescription>{t("form.usage_limit_description")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="expiresAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.expires_at")}</FormLabel>
              <FormControl>
                <Input
                  type="datetime-local"
                  placeholder={t("form.expires_at_placeholder")}
                  {...field}
                  value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                  onChange={(e) => {
                    const value = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                    field.onChange(value);
                  }}
                />
              </FormControl>
              <FormDescription>{t("form.expires_at_description")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("form.status")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t("form.status_placeholder")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ACTIVE">{t("status.active")}</SelectItem>
                <SelectItem value="INACTIVE">{t("status.inactive")}</SelectItem>
                <SelectItem value="EXPIRED">{t("status.expired")}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("creating") : t("create")}
        </Button>
      </DialogFooter>
    </>
  );
}
