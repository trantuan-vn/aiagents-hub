import { Globe, Moon, Sun, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

import { LOCALE_OPTIONS, type Locale } from "@/types/preferences/locale";
import type { ThemeMode } from "@/types/preferences/theme";

import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

export type NavLink = { name: string; path: string };

export function DesktopNavigation({
  navLinks,
  isActive,
  t,
}: {
  navLinks: NavLink[];
  isActive: (path: string) => boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="hidden items-center gap-1 lg:flex">
      {navLinks.map((link) => (
        <Link
          key={link.path}
          to={link.path}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
            isActive(link.path)
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {link.name}
        </Link>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200">
          {t("resources")}
          <ChevronDown className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link to="/support">{t("support")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/blog">{t("blog")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/changelog">{t("changelog")}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DesktopCTA({
  themeMode,
  locale,
  handleThemeToggle,
  handleLocaleChange,
  t,
}: {
  themeMode: ThemeMode;
  locale: Locale;
  handleThemeToggle: () => void;
  handleLocaleChange: (newLocale: Locale) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="hidden items-center gap-2 lg:flex">
      <Button size="icon" variant="ghost" onClick={handleThemeToggle}>
        {themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost">
            <Globe className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {LOCALE_OPTIONS.map((lang) => (
            <DropdownMenuItem
              key={lang.value}
              onClick={() => handleLocaleChange(lang.value)}
              className={locale === lang.value ? "bg-accent" : ""}
            >
              {lang.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          window.location.href = "/auth/v3/login";
        }}
      >
        {t("sign_in")}
      </Button>
      <Button
        variant="gradient"
        size="sm"
        onClick={() => {
          window.location.href = "/auth?mode=signup";
        }}
      >
        {t("get_started")}
      </Button>
    </div>
  );
}

export function MobileMenu({
  navLinks,
  isActive,
  themeMode,
  locale,
  handleThemeToggle,
  handleLocaleChange,
  setIsMobileMenuOpen,
  t,
}: {
  navLinks: NavLink[];
  isActive: (path: string) => boolean;
  themeMode: ThemeMode;
  locale: Locale;
  handleThemeToggle: () => void;
  handleLocaleChange: (newLocale: Locale) => void;
  setIsMobileMenuOpen: (open: boolean) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="border-border animate-slide-down bg-background/98 border-t py-4 backdrop-blur-lg lg:hidden">
      <div className="flex flex-col gap-2">
        {navLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
              isActive(link.path)
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {link.name}
          </Link>
        ))}
        <div className="flex flex-col gap-1 px-4 py-2">
          <div className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider">
            {t("resources")}
          </div>
          <Link
            to="/support"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
              isActive("/support")
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {t("support")}
          </Link>
          <Link
            to="/blog"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
              isActive("/blog")
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {t("blog")}
          </Link>
          <Link
            to="/changelog"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
              isActive("/changelog")
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {t("changelog")}
          </Link>
        </div>
        <div className="border-border mt-4 flex flex-col gap-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleThemeToggle} className="flex-1">
              {themeMode === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              {themeMode === "dark" ? "Light" : "Dark"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="flex-1">
                  <Globe className="mr-2 h-4 w-4" />
                  {LOCALE_OPTIONS.find((l) => l.value === locale)?.label ?? "Language"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {LOCALE_OPTIONS.map((lang) => (
                  <DropdownMenuItem
                    key={lang.value}
                    onClick={() => handleLocaleChange(lang.value)}
                    className={locale === lang.value ? "bg-accent" : ""}
                  >
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setIsMobileMenuOpen(false);
              window.location.href = "/auth/v3/login";
            }}
          >
            {t("sign_in")}
          </Button>
          <Button
            variant="gradient"
            className="w-full"
            onClick={() => {
              setIsMobileMenuOpen(false);
              window.location.href = "/auth?mode=signup";
            }}
          >
            {t("get_started")}
          </Button>
        </div>
      </div>
    </div>
  );
}
