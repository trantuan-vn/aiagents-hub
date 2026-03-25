"use client";

import { Zap, Github, Twitter, Linkedin, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

const Footer = () => {
  const t = useTranslations("Footer");

  const footerLinks = {
    [t("product")]: [
      { name: t("api_packages"), path: "/packages" },
      { name: t("documentation"), path: "/docs" },
    ],
    [t("company")]: [
      { name: t("about"), path: "/about" },
      { name: t("blog"), path: "/blog" },
      { name: t("careers"), path: "/careers" },
      { name: t("contact"), path: "/contact" },
    ],
    [t("resources")]: [
      { name: t("support"), path: "/support" },
      { name: t("terms"), path: "/terms" },
    ],
    [t("developers")]: [
      { name: t("api_reference"), path: "/docs/api" },
      { name: t("community"), path: "/community" },
    ],
  };

  const socialLinks = [
    { icon: Github, href: "#", label: "GitHub" },
    { icon: Twitter, href: "#", label: "Twitter" },
    { icon: Linkedin, href: "#", label: "LinkedIn" },
    { icon: Mail, href: "#", label: "Email" },
  ];

  return (
    <footer className="bg-card border-border border-t">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="mb-4 flex items-center gap-2">
              <div className="from-primary to-accent flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br">
                <Zap className="text-primary-foreground h-5 w-5" />
              </div>
              <span className="text-xl font-bold">
                API<span className="text-primary">Hub</span>
              </span>
            </Link>
            <p className="text-muted-foreground mb-6 max-w-xs text-sm">{t("description")}</p>
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
                >
                  <social.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="mb-4 text-sm font-semibold">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <Link
                      to={link.path}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="border-border mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
          <p className="text-muted-foreground text-sm">{t("copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              {t("privacy_policy")}
            </Link>
            <Link to="/terms" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              {t("terms_of_service")}
            </Link>
            <Link to="/cookies" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              {t("cookies")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
