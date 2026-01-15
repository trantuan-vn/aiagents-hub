"use client";

import { ReactNode } from "react";

import Footer from "./footer";
import Navbar from "./navbar";

interface LayoutProps {
  children: ReactNode;
  showFooter?: boolean;
}

function Layout({ children, showFooter = true }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      {showFooter && <Footer />}
    </div>
  );
}

export default Layout;
