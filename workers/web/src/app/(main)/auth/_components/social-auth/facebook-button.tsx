"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { siFacebook } from "simple-icons";
import { toast } from "sonner";
import { z } from "zod";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { getAuthApiErrorMessage } from "@/lib/auth-api-error";
import { buildAuthClientHeaders } from "@/lib/auth-client-headers";
import { cn } from "@/lib/utils";

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";

const FacebookOAuthSchema = z.object({
  url: z.string().url(),
});

export function FacebookButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("LoginForm");
  const ref = searchParams.get("ref");

  const handleFacebookLogin = async () => {
    try {
      const url = new URL(`${AUTH_API_URL}/oauth/facebook/url`);
      if (ref) url.searchParams.set("ref", ref);
      const response = await fetch(url.toString(), {
        credentials: "include",
        headers: buildAuthClientHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getAuthApiErrorMessage(response, t("unexpected_error"), t));
      }

      const data = await response.json();
      const validatedData = FacebookOAuthSchema.parse(data);

      router.push(validatedData.url);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unexpected_error");
      toast.error(msg);
    }
  };

  return (
    <Button variant="secondary" className={cn(className)} onClick={handleFacebookLogin} {...props}>
      <SimpleIcon icon={siFacebook} className="size-4" />
      Continue with Facebook
    </Button>
  );
}
