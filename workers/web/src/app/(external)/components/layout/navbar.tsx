"use client";

import { useState, useEffect } from "react";

import { Globe, Menu, Moon, Sun, X, Zap, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useLocation } from "react-router-dom";

import { updateThemeMode } from "@/lib/theme-utils";
import { setValueToCookie } from "@/server/server-actions";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { LOCALE_OPTIONS, type Locale } from "@/types/preferences/locale";
import type { ThemeMode } from "@/types/preferences/theme";

import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const t = useTranslations("Navbar");
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);

  // Sync theme with document
  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);

  const handleThemeToggle = async () => {
    const newTheme: ThemeMode = themeMode === "dark" ? "light" : "dark";
    updateThemeMode(newTheme);
    setThemeMode(newTheme);
    await setValueToCookie("theme_mode", newTheme);
  };

  const handleLocaleChange = async (newLocale: Locale) => {
    setLocale(newLocale);
    await setValueToCookie("locale", newLocale);
    // Reload page to apply new locale
    window.location.reload();
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: t("home"), path: "/" },
    { name: t("packages"), path: "/packages" },
    { name: t("documentation"), path: "/docs" },
    { name: t("pricing"), path: "/pricing" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className={`fixed top-0 right-0 left-0 z-50 transition-all duration-300 ${
        isScrolled ? "glass shadow-lg" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between lg:h-20">
          {/* Logo */}
          <Link to="/" className="group flex items-center gap-2">
            <div className="relative">
              <div className="from-primary to-accent flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg transition-shadow duration-300 group-hover:shadow-xl">
                <Zap className="text-primary-foreground h-5 w-5" />
              </div>
              <div className="from-primary to-accent absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-50" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              API<span className="text-primary">Hub</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
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

          {/* Desktop CTA */}
          <div className="hidden items-center gap-2 lg:flex">
            {/* Theme Switcher */}
            <Button size="icon" variant="ghost" onClick={handleThemeToggle}>
              {themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Language Switcher */}
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

            <Link to="/auth/v3/login">
              <Button variant="ghost" size="sm">
                {t("sign_in")}
              </Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button variant="gradient" size="sm">
                {t("get_started")}
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="hover:bg-muted rounded-lg p-2 transition-colors lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="border-border animate-slide-down border-t py-4 lg:hidden">
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
              <div className="border-border mt-4 flex flex-col gap-2 border-t pt-4">
                {/* Theme and Language Switchers */}
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

                <Link to="/auth" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full">
                    {t("sign_in")}
                  </Button>
                </Link>
                <Link to="/auth?mode=signup" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="gradient" className="w-full">
                    {t("get_started")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
