"use client";

import { useEffect } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { updateThemeMode, updateThemePreset } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import Dashboard from "./pages/dashboard";
import Index from "./pages/index";
import Packages from "./pages/packages";
import Support from "./pages/support";

const queryClient = new QueryClient();

// Theme sync component
function ThemeSync() {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const themePreset = usePreferencesStore((s) => s.themePreset);

  useEffect(() => {
    // Sync theme immediately on mount to ensure it's applied
    updateThemeMode(themeMode);
    updateThemePreset(themePreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  useEffect(() => {
    // Sync theme when it changes
    updateThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    // Sync theme preset when it changes
    updateThemePreset(themePreset);
  }, [themePreset]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeSync />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/packages" element={<Packages />} />
          {/* <Route path="/auth" element={<Auth />} /> */}
          <Route path="/demo-dashboard" element={<Dashboard />} />
          <Route path="/support" element={<Support />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE
          <Route path="*" element={<NotFound />} /> */}
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
