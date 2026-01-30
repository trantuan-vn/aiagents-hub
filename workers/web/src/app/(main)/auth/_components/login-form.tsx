"use client";
import { useState, useCallback, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// Custom debounce function
/* eslint-disable space-before-function-paren */
/* eslint-disable @typescript-eslint/no-explicit-any */
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// Schema for form validation - will be created with translations in component

// Interface for API error response
interface ErrorResponse {
  error?: string;
}

export function LoginForm() {
  const t = useTranslations("LoginForm");
  const locale = useLocale();
  const [showOtpPopup, setShowOtpPopup] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isMounted = useRef(true);
  const router = useRouter();

  // Ngôn ngữ gửi lên API: vi -> templateId=1, en -> templateId=2
  const language = locale.startsWith("vi") ? "vi" : "en";

  // Schema for form validation - email only
  const FormSchema = z.object({
    email: z
      .string()
      .min(1, { message: t("email_required") })
      .email({ message: t("email_invalid") }),
  });

  // Form setup with react-hook-form
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
    },
    mode: "onChange",
  });

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Helper function to extract error message
  const getErrorMessage = async (response: Response): Promise<string> => {
    try {
      const errorData: ErrorResponse = await response.json();
      return errorData.error ?? t("unexpected_error");
    } catch {
      return t("unexpected_error");
    }
  };

  // Validate OTP
  const validateOtp = (otp: string): boolean => {
    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      toast.error(t("otp_invalid"));
      return false;
    }
    return true;
  };

  // Handle OTP verification
  const handleOtpVerify = useCallback(async () => {
    if (!isMounted.current || !validateOtp(otp)) return;

    setIsLoading(true);
    try {
      const response = await fetch("https://api.unitoken.trade/dashboard/auth/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      setShowOtpPopup(false);
      setOtp("");
      form.reset();
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("otp_verify_error"));
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [otp, identifier, form, router]);

  // Handle form submission
  const onSubmit = useCallback(
    async (data: z.infer<typeof FormSchema>) => {
      if (!isMounted.current) return;
      setIsLoading(true);
      try {
        const requestResponse = await fetch("https://api.unitoken.trade/dashboard/auth/otp/request", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            identifier: data.email.trim(),
            language,
          }),
        });

        if (!requestResponse.ok) {
          const errorMessage = await getErrorMessage(requestResponse);
          throw new Error(errorMessage);
        }

        if (isMounted.current) {
          setIdentifier(data.email.trim());
          setShowOtpPopup(true);
          toast.success(t("otp_sent_success"));
        }
      } catch (error) {
        if (isMounted.current) {
          toast.error(error instanceof Error ? error.message : t("otp_send_error"));
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    },
    [language]
  );

  // Debounced OTP input handler
  const handleOtpChange = useCallback(
    debounce((value: string) => {
      if (isMounted.current) {
        const numericValue = value.replace(/\D/g, "").slice(0, 6);
        setOtp(numericValue);
      }
    }, 300),
    [],
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="email">{t("email_label")}</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("email_placeholder")}
                  autoComplete="email"
                  aria-required="true"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isLoading || !form.formState.isValid}>
          {isLoading ? t("sending_otp") : t("login_button")}
        </Button>
      </form>

      {/* OTP Dialog */}
      <Dialog
        open={showOtpPopup}
        onOpenChange={(open) => {
          if (!open) {
            setOtp("");
          }
          setShowOtpPopup(open);
        }}
      >
        <DialogContent className="sm:max-w-md" aria-describedby="otp-dialog-description">
          <DialogHeader>
            <DialogTitle>{t("otp_dialog_title")}</DialogTitle>
            <div id="otp-dialog-description" className="text-muted-foreground text-sm">
              {t("otp_dialog_description")} <strong>{identifier}</strong>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <FormLabel htmlFor="otp-input">{t("otp_label")}</FormLabel>
              <Input
                id="otp-input"
                type="text"
                placeholder={t("otp_placeholder")}
                value={otp}
                onChange={(e) => handleOtpChange(e.target.value)}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                className="text-center font-mono text-lg tracking-widest"
                aria-required="true"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowOtpPopup(false);
                  setOtp("");
                }}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleOtpVerify}
                disabled={isLoading || otp.length !== 6}
              >
                {isLoading ? t("verifying") : t("verify_otp")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
