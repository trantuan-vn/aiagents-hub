"use client";

import Link from "next/link";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("NotFoundPage");

  return (
    <div className="flex h-dvh flex-col items-center justify-center space-y-2 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Link replace href="/dashboard/default">
        <Button variant="outline">{t("go_back_home")}</Button>
      </Link>
    </div>
  );
}
