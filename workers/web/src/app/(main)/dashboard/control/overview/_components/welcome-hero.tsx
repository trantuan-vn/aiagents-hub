"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Bell, ChevronRight, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface UserProfile {
  id: string;
  identifier: string;
  address?: string;
  role?: string;
}

interface WelcomeHeroProps {
  t: (key: string) => string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function getDisplayName(identifier: string): string {
  if (identifier.includes("@")) {
    const localPart = identifier.split("@")[0];
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }
  return identifier || "there";
}

export function WelcomeHero({ t }: WelcomeHeroProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: UserProfile = await res.json();
        setProfile(data);
      }
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const greeting = getGreeting();
  const displayName = profile ? getDisplayName(profile.identifier) : t("guest");
  const greetingTextKey = `welcome.greeting_${greeting}`;
  const greetingDescKey = `welcome.${greeting}`;

  return (
    <div className="from-primary/10 via-background to-accent/10 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-sm transition-all duration-300 hover:shadow-md md:p-8">
      {/* Decorative elements */}
      <div className="bg-primary/5 absolute -top-8 -right-8 h-32 w-32 rounded-full blur-2xl" />
      <div className="bg-accent/10 absolute -bottom-4 -left-4 h-24 w-24 rounded-full blur-xl" />
      <div className="absolute top-12 right-12 opacity-20">
        <Sparkles className="text-primary h-8 w-8" />
      </div>

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          {isLoading ? (
            <div className="bg-muted flex h-10 w-48 animate-pulse rounded-lg" />
          ) : (
            <>
              <p className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
                {t("welcome.subtitle")}
              </p>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
                <Zap className="text-primary h-7 w-7" />
                {t(greetingTextKey)}{" "}
                <span className="from-primary to-accent bg-gradient-to-r bg-clip-text text-transparent">
                  {displayName}
                </span>
                !
              </h1>
              <p className="text-muted-foreground max-w-xl text-sm md:text-base">{t(greetingDescKey)}</p>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <Button variant="outline" size="sm" className="gap-2">
            <Bell className="h-4 w-4" />
            {t("notifications")}
          </Button>
          <Button size="sm" asChild className="gap-1.5">
            <Link href="/packages">
              {t("explore_packages")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
