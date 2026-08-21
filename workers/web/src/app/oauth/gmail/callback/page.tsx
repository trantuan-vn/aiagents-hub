"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { publishGmailOAuthResult } from "@/app/(main)/dashboard/build/workflows/_components/nodes/human-review/gmail/oauth-bridge";

function GmailOAuthCallbackInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ok = searchParams.get("ok") === "1";
    const credentialKey = searchParams.get("credentialKey") ?? undefined;
    const name = searchParams.get("name") ?? undefined;
    const email = searchParams.get("email") ?? undefined;
    const error = searchParams.get("error") ?? undefined;

    publishGmailOAuthResult({
      ok,
      credentialKey,
      name,
      email,
      error,
    });

    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 800);

    return () => window.clearTimeout(t);
  }, [searchParams]);

  const ok = searchParams.get("ok") === "1";
  const email = searchParams.get("email");
  const error = searchParams.get("error");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <div
          className={`mx-auto mb-3 flex size-10 items-center justify-center rounded-full text-lg ${
            ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          {ok ? "✓" : "!"}
        </div>
        <h1 className="text-base font-semibold text-zinc-900">
          {ok ? "Gmail connected successfully" : "Connection failed"}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {ok
            ? email
              ? `Connected as ${email}. You can close this window.`
              : "Connected. You can close this window."
            : error || "Something went wrong. You can close this window."}
        </p>
      </div>
    </main>
  );
}

/** Public popup landing — outside /dashboard so auth middleware does not redirect. */
export default function GmailOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-6 text-sm text-zinc-600">
          Completing Google sign-in…
        </main>
      }
    >
      <GmailOAuthCallbackInner />
    </Suspense>
  );
}
