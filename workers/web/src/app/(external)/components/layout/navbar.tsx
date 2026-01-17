"use client";

import { useState, useEffect } from "react";

import { Menu, X, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useLocation } from "react-router-dom";

import { updateThemeMode } from "@/lib/theme-utils";
import { setValueToCookie } from "@/server/server-actions";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import type { Locale } from "@/types/preferences/locale";
import type { ThemeMode } from "@/types/preferences/theme";

import { DesktopCTA, DesktopNavigation, MobileMenu } from "./navbar-components";

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
    // Reload page to apply new locale while preserving current path
    // The catch-all route will handle all paths and React Router will route correctly
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
        isScrolled
          ? "glass bg-background/95 lg:bg-background/80 shadow-lg backdrop-blur-md lg:backdrop-blur-sm"
          : "bg-background/95 bg-transparent backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none"
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

          <DesktopNavigation navLinks={navLinks} isActive={isActive} t={t} />
          <DesktopCTA
            themeMode={themeMode}
            locale={locale}
            handleThemeToggle={handleThemeToggle}
            handleLocaleChange={handleLocaleChange}
            t={t}
          />

          {/* Mobile Menu Toggle */}
          <button
            className="hover:bg-muted rounded-lg p-2 transition-colors lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <MobileMenu
            navLinks={navLinks}
            isActive={isActive}
            themeMode={themeMode}
            locale={locale}
            handleThemeToggle={handleThemeToggle}
            handleLocaleChange={handleLocaleChange}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            t={t}
          />
        )}
      </div>
    </nav>
  );
}
