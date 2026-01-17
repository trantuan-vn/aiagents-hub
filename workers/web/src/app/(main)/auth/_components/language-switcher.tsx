"use client";

import { useRouter } from "next/navigation";

import { Globe } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setValueToCookie } from "@/server/server-actions";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { LOCALE_OPTIONS, type Locale } from "@/types/preferences/locale";

export function LanguageSwitcher() {
  const router = useRouter();
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);

  const handleLocaleChange = async (value: string) => {
    const newLocale = value as Locale;
    setLocale(newLocale);
    await setValueToCookie("locale", newLocale);
    // Reload page to apply new locale
    router.refresh();
    window.location.reload();
  };

  const currentLocaleLabel = LOCALE_OPTIONS.find((opt) => opt.value === locale)?.label ?? locale;

  return (
    <div className="flex items-center gap-2">
      <Globe className="text-muted-foreground size-4" />
      <Select value={locale} onValueChange={handleLocaleChange}>
        <SelectTrigger
          size="sm"
          className="h-auto w-auto border-none bg-transparent p-0 text-sm font-normal shadow-none hover:bg-transparent focus:ring-0 data-[state=open]:bg-transparent"
        >
          <SelectValue>
            <span className="text-muted-foreground cursor-pointer">{currentLocaleLabel}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {LOCALE_OPTIONS.map((lang) => (
            <SelectItem key={lang.value} value={lang.value}>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
