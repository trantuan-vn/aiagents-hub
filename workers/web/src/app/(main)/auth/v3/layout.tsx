import type { ReactNode } from "react";

import { Command, Cloud, Code, Zap, Shield, Globe } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const t = await getTranslations("AuthLayout");
  return (
    <main>
      <div className="grid h-dvh justify-center p-2 lg:grid-cols-2">
        <div className="bg-primary relative order-2 hidden h-full flex-col rounded-3xl lg:flex">
          <div className="text-primary-foreground absolute top-10 space-y-2 px-10">
            <div className="flex items-center gap-3">
              <Command className="size-8" />
              <h1 className="text-3xl font-semibold">{t("apihub_title")}</h1>
            </div>
            <p className="text-primary-foreground/80 text-base font-light">{t("apihub_tagline")}</p>
          </div>

          <div className="flex flex-1 items-center justify-center px-10">
            <div className="text-primary-foreground max-w-md space-y-6">
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Zap className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <h3 className="mb-1 font-semibold">{t("feature_speed_title")}</h3>
                    <p className="text-primary-foreground/80 text-sm">{t("feature_speed_description")}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Shield className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <h3 className="mb-1 font-semibold">{t("feature_security_title")}</h3>
                    <p className="text-primary-foreground/80 text-sm">{t("feature_security_description")}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Cloud className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <h3 className="mb-1 font-semibold">{t("feature_scalability_title")}</h3>
                    <p className="text-primary-foreground/80 text-sm">{t("feature_scalability_description")}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Code className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <h3 className="mb-1 font-semibold">{t("feature_integration_title")}</h3>
                    <p className="text-primary-foreground/80 text-sm">{t("feature_integration_description")}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <h3 className="mb-1 font-semibold">{t("feature_global_title")}</h3>
                    <p className="text-primary-foreground/80 text-sm">{t("feature_global_description")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-10 w-full px-10">
            <p className="text-primary-foreground/60 text-center text-xs">{t("trust_message")}</p>
          </div>
        </div>
        <div className="relative order-1 flex h-full">{children}</div>
      </div>
    </main>
  );
}
