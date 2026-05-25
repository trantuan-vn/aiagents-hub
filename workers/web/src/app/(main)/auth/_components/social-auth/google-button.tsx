"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { siGoogle } from "simple-icons";
import { z } from "zod";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { buildAuthClientHeaders } from "@/lib/auth-client-headers";
import { cn } from "@/lib/utils";

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";

const GoogleOAuthSchema = z.object({
  url: z.string().url(),
});

export function GoogleButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  const handleGoogleLogin = async () => {
    try {
      const url = new URL(`${AUTH_API_URL}/oauth/google/url`);
      if (ref) url.searchParams.set("ref", ref);
      const response = await fetch(url.toString(), {
        credentials: "include",
        headers: buildAuthClientHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const validatedData = GoogleOAuthSchema.parse(data);

      router.push(validatedData.url);
    } catch (error) {
      console.error("Failed to get Google OAuth URL:", error);
    }
  };

  return (
    <Button variant="secondary" className={cn(className)} onClick={handleGoogleLogin} {...props}>
      <SimpleIcon icon={siGoogle} className="size-4" />
      Continue with Google
    </Button>
  );
}
