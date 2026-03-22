"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { siGithub } from "simple-icons";
import { z } from "zod";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.unitoken.trade/dashboard/auth";

const GithubOAuthSchema = z.object({
  url: z.string().url(),
});

export function GithubButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  const handleGithubLogin = async () => {
    try {
      const url = new URL(`${AUTH_API_URL}/oauth/github/url`);
      if (ref) url.searchParams.set("ref", ref);
      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const validatedData = GithubOAuthSchema.parse(data);

      router.push(validatedData.url);
    } catch (error) {
      console.error("Failed to get Github OAuth URL:", error);
    }
  };

  return (
    <Button variant="secondary" className={cn(className)} onClick={handleGithubLogin} {...props}>
      <SimpleIcon icon={siGithub} className="size-4" />
      Continue with Github
    </Button>
  );
}
