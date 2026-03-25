"use client";

import { useEffect } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { updateThemeMode, updateThemePreset } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import About from "./pages/about";
import Blog from "./pages/blog";
import BlogPost from "./pages/blog-post";
import Careers from "./pages/careers";
import Community from "./pages/community";
import Contact from "./pages/contact";
import Cookies from "./pages/cookies";
import DocsApi from "./pages/docs/api";
import DocsIndex from "./pages/docs/index";
import DocsQuickstart from "./pages/docs/quickstart";
import Index from "./pages/index";
import Packages from "./pages/packages";
import Privacy from "./pages/privacy";
import Support from "./pages/support";
import Terms from "./pages/terms";

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
          <Route path="/about" element={<About />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/community" element={<Community />} />
          {/* <Route path="/auth" element={<Auth />} /> */}
          {/* <Route path="/demo-dashboard" element={<Dashboard />} /> */}
          <Route path="/support" element={<Support />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/docs" element={<DocsIndex />} />
          <Route path="/docs/quickstart" element={<DocsQuickstart />} />
          <Route path="/docs/api" element={<DocsApi />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE
          <Route path="*" element={<NotFound />} /> */}
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
