import { Suspense } from "react";

import { getTranslations } from "next-intl/server";

import { APP_CONFIG } from "@/config/app-config";

import { LanguageSwitcher } from "../../_components/language-switcher";
import { LoginForm } from "../../_components/login-form";
import { FacebookButton } from "../../_components/social-auth/facebook-button";
import { GoogleButton } from "../../_components/social-auth/google-button";
import { WalletConnectButton } from "../../_components/web3/walletconnect-button";

export default async function Page() {
  const t = await getTranslations("LoginPage");

  return (
    <>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-medium">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        <div className="space-y-4">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
            <span className="bg-background text-muted-foreground relative z-10 px-2">{t("or_continue_with")}</span>
          </div>
          <GoogleButton className="w-full" />
          <FacebookButton className="w-full" />
          <WalletConnectButton className="w-full" />
        </div>
      </div>

      <div className="absolute bottom-5 flex w-full justify-between px-10">
        <div className="text-sm">{APP_CONFIG.copyright}</div>
        <LanguageSwitcher />
      </div>
    </>
  );
}
