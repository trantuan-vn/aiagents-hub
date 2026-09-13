"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ChatTriggerConversation,
  newChatSessionId,
  seedChatTriggerMessages,
  type ChatTriggerMessage,
} from "@/app/(main)/dashboard/build/workflows/_components/chat/chat-trigger-conversation";
import {
  hubChatLoginHref,
  isChatMetaPayload,
  isHubAuthReturn,
  parseChatAuthChallenge,
  postChatBasicLogin,
  type ChatAuthChallenge,
} from "@/app/(main)/dashboard/build/workflows/_components/chat/chat-auth";
import { buildChatApiUrl } from "@/app/(main)/dashboard/build/workflows/_components/panels/node-config/chat-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PublicChatMode = "test" | "production";

type ChatMeta = {
  title?: string;
  subtitle?: string;
  initialMessages?: string;
  inputPlaceholder?: string;
};

export function PublicHostedChatPage({
  workflowId,
  chatPath,
  ownerId,
  mode,
}: {
  workflowId: number;
  chatPath: string;
  ownerId?: string;
  mode: PublicChatMode;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const endpointUrl = useMemo(
    () => buildChatApiUrl({ workflowId, chatPath, mode, ownerId }),
    [workflowId, chatPath, mode, ownerId],
  );
  const [sessionId] = useState(newChatSessionId);
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authChallenge, setAuthChallenge] = useState<ChatAuthChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatTriggerMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);

  const applyChallenge = useCallback((challenge: ChatAuthChallenge) => {
    if (challenge.auth === "hub_users") {
      if (isHubAuthReturn()) {
        setAuthChallenge(null);
        setError(t("chat_auth_hub_failed"));
        setLoading(false);
        return;
      }
      setAuthChallenge(challenge);
      setLoading(false);
      window.location.assign(hubChatLoginHref(challenge.loginUrl));
      return;
    }
    setAuthChallenge(challenge);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(endpointUrl);
    url.searchParams.set("format", "json");
    void (async () => {
      try {
        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        const challenge = parseChatAuthChallenge(res.status, data);
        if (challenge) {
          applyChallenge(challenge);
          return;
        }
        if (res.redirected && /\/auth\//.test(res.url)) {
          window.location.assign(res.url);
          return;
        }
        if (!res.ok) {
          setError(String(data.error ?? t("chat_unavailable")));
          setLoading(false);
          return;
        }
        if (!isChatMetaPayload(data)) {
          applyChallenge({ auth: "basic" });
          return;
        }
        const nextMeta: ChatMeta = {
          title: typeof data.title === "string" ? data.title : undefined,
          subtitle: typeof data.subtitle === "string" ? data.subtitle : undefined,
          initialMessages: typeof data.initialMessages === "string" ? data.initialMessages : undefined,
          inputPlaceholder: typeof data.inputPlaceholder === "string" ? data.inputPlaceholder : undefined,
        };
        setAuthChallenge(null);
        setError(null);
        setMeta(nextMeta);
        setMessages(seedChatTriggerMessages(nextMeta.initialMessages));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(t("chat_unavailable"));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyChallenge, authEpoch, endpointUrl, t]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-full min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t("chat_loading")}
      </div>
    );
  }

  if (authChallenge?.auth === "hub_users") {
    return (
      <div className="text-muted-foreground flex h-full min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t("chat_auth_hub_redirecting")}
      </div>
    );
  }

  if (authChallenge?.auth === "basic") {
    return (
      <ChatBasicLoginCard
        endpointUrl={endpointUrl}
        title={meta?.title || t("chat_auth_required_title")}
        onSuccess={() => {
          setLoading(true);
          setError(null);
          setAuthChallenge(null);
          setAuthEpoch((value) => value + 1);
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center px-4">
        <div className="bg-background max-w-md rounded-xl border p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold">{t("chat_unavailable_title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  const sessionShort = sessionId.slice(0, 8);

  return (
    <div className="bg-muted/40 flex h-svh min-h-0 flex-col">
      <ChatTriggerConversation
        className="mx-auto w-full max-w-3xl border-x bg-transparent"
        endpointUrl={endpointUrl}
        sessionId={sessionId}
        initialMessages={meta?.initialMessages}
        inputPlaceholder={meta?.inputPlaceholder}
        messages={messages}
        onMessagesChange={setMessages}
        sending={sending}
        onSendingChange={setSending}
        onAuthRequired={applyChallenge}
        header={
          <div className="bg-background flex shrink-0 flex-col gap-0.5 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">{meta?.title || t("chat_panel_title")}</h1>
              <span className="text-muted-foreground ml-auto font-mono text-[11px]">
                {t("chat_session", { id: sessionShort })}
              </span>
            </div>
            {meta?.subtitle ? <p className="text-muted-foreground text-xs">{meta.subtitle}</p> : null}
          </div>
        }
      />
    </div>
  );
}

function ChatBasicLoginCard({
  endpointUrl,
  title,
  onSuccess,
}: {
  endpointUrl: string;
  title: string;
  onSuccess: () => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setLoginError(null);
    const result = await postChatBasicLogin(endpointUrl, username, password);
    setSubmitting(false);
    if (!result.ok) {
      setLoginError(result.error === "Invalid username or password" ? t("chat_auth_invalid") : result.error);
      return;
    }
    onSuccess();
  };

  return (
    <div className="flex h-full min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="bg-background w-full max-w-sm space-y-4 rounded-xl border p-6 shadow-sm"
      >
        <h1 className="text-center text-base font-semibold">{title}</h1>
        {loginError ? <p className="text-destructive text-center text-sm">{loginError}</p> : null}
        <div className="space-y-1.5">
          <Label htmlFor="chat-auth-user">{t("chat_auth_username")}</Label>
          <Input
            id="chat-auth-user"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chat-auth-password">{t("chat_auth_password")}</Label>
          <Input
            id="chat-auth-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#ff6f00] text-white hover:bg-[#e66300]"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : t("chat_auth_sign_in")}
        </Button>
      </form>
    </div>
  );
}
