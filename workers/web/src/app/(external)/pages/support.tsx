"use client";

import { useEffect, useRef, useState } from "react";

import { MessageCircle, Send, Bot, User, Book, HelpCircle, Mail, Clock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatAssistantReply } from "@/app/(main)/dashboard/control/assistant/_components/assistant-html";
import { AssistantReply } from "@/app/(main)/dashboard/control/assistant/_components/assistant-reply";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HumanChallengeTurnstile, useHumanChallenge } from "@/hooks/use-human-challenge";

import Layout from "../components/layout/main-layout";
import {
  cannedSupportKey,
  parseSupportReply,
  postSiteSupportChat,
  replyWithinSecondsFromBody,
  SUPPORT_CHAT_INPUT_MAX,
  SUPPORT_SESSION_STORAGE_KEY,
  siteSupportTimingUrl,
  supportCtaHref,
  SupportChatError,
  type SupportCta,
} from "./support-chat";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  cta?: SupportCta;
}

function readSessionId(): string {
  const existing = sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, created);
  return created;
}

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";
const ENV_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const Support = ({ chatUrl = null }: { chatUrl?: string | null }) => {
  const t = useTranslations("SupportPage");
  const liveWorkflow = Boolean(chatUrl);
  const [signedIn, setSignedIn] = useState(false);
  const [supportSessionId, setSupportSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content: t("ai_responses.welcome"),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [replySeconds, setReplySeconds] = useState<number | null>(null);
  const sendingRef = useRef(false);
  const nextId = useRef(2);

  const quickActions = [
    t("quick_actions.build_agent"),
    t("quick_actions.credits_left"),
    t("quick_actions.how_credits"),
    t("quick_actions.upgrade"),
  ];

  const faqItems = [
    {
      question: t("faq.first_workflow.question"),
      answer: t("faq.first_workflow.answer"),
    },
    {
      question: t("faq.credits.question"),
      answer: t("faq.credits.answer"),
    },
    {
      question: t("faq.change_plan.question"),
      answer: t("faq.change_plan.answer"),
    },
    {
      question: t("faq.free_trial.question"),
      answer: t("faq.free_trial.answer"),
    },
    {
      question: t("faq.cancel_plan.question"),
      answer: t("faq.cancel_plan.answer"),
    },
  ];

  const captcha = useHumanChallenge({
    authApiUrl: AUTH_API_URL,
    scope: "support",
    sessionId: supportSessionId || undefined,
    envFallbackSiteKey: ENV_TURNSTILE_SITE_KEY,
    revealWhenUnsatisfied: liveWorkflow,
    hideWhenSolved: true,
  });
  const blockForCaptcha = liveWorkflow && captcha.needsTokenBeforeSubmit;

  useEffect(() => {
    setSupportSessionId(readSessionId());
    void fetch(`${AUTH_API_URL}/profile/me`, { method: "GET", credentials: "include" })
      .then((response) => setSignedIn(response.ok))
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!liveWorkflow) return;
    const controller = new AbortController();
    void fetch(siteSupportTimingUrl(), { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!controller.signal.aborted) setReplySeconds(replyWithinSecondsFromBody(body));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setReplySeconds(null);
      });
    return () => controller.abort();
  }, [liveWorkflow]);

  const takeId = () => {
    const id = nextId.current;
    nextId.current += 1;
    return id;
  };

  const cannedReply = (query: string, withEmail: boolean): Message => {
    const key = cannedSupportKey(query);
    const body = key === "default" ? t("ai_responses.default", { query }) : t(`ai_responses.${key}`);
    return {
      id: takeId(),
      role: "assistant",
      content: withEmail ? `${body}\n\n${t("fallback_email_note")}` : body,
    };
  };

  const send = (raw: string) => {
    const chatInput = raw.trim().slice(0, SUPPORT_CHAT_INPUT_MAX);
    if (!chatInput || sendingRef.current || blockForCaptcha) return;
    sendingRef.current = true;
    setInputValue("");
    setIsTyping(true);
    const userId = takeId();
    setMessages((prev) => [...prev, { id: userId, role: "user", content: chatInput }]);

    const finish = (assistant: Message) => {
      setMessages((prev) => [...prev, assistant]);
      setIsTyping(false);
      sendingRef.current = false;
    };

    if (!chatUrl) {
      finish(cannedReply(chatInput, false));
      return;
    }

    void postSiteSupportChat({
      endpointUrl: chatUrl,
      sessionId: readSessionId(),
      chatInput,
      turnstileToken: captcha.turnstileTokenForBody(),
    })
      .then(async (result) => {
        await captcha.onRequestSuccess().catch(() => undefined);
        if (result.accountGate) {
          finish({ id: takeId(), role: "assistant", content: t("account_gate"), cta: "signup" });
          return;
        }
        const parsed = parseSupportReply(result.output);
        if (!parsed.text && !parsed.cta) {
          finish(cannedReply(chatInput, true));
          return;
        }
        finish({
          id: takeId(),
          role: "assistant",
          content: parsed.text,
          cta: parsed.cta ?? undefined,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof SupportChatError && error.requiresCaptcha) {
          captcha.applyCaptchaError({
            requiresCaptcha: true,
            siteKey: error.siteKey,
            error: error.message,
          });
          setMessages((prev) => prev.filter((message) => message.id !== userId));
          setInputValue(chatInput);
          setIsTyping(false);
          sendingRef.current = false;
          return;
        }
        if (error instanceof SupportChatError && error.status === 429) {
          const key = error.code === "site_support_daily" ? "rate_limited_daily" : "rate_limited";
          finish({ id: takeId(), role: "assistant", content: t(key) });
          return;
        }
        finish(cannedReply(chatInput, true));
      });
  };

  return (
    <Layout>
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <div className="bg-primary/10 border-primary/20 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
              <MessageCircle className="text-primary h-4 w-4" />
              <span className="text-primary text-xs font-medium">{t("badge")}</span>
            </div>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
            </h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {signedIn ? (
                <p className="text-muted-foreground mb-3 text-sm">
                  {t("signed_in_banner")}{" "}
                  <a href="/dashboard/control/assistant" className="text-primary font-medium underline-offset-4 hover:underline">
                    {t("signed_in_link")}
                  </a>
                </p>
              ) : null}
              <Card className="flex h-[600px] flex-col">
                <CardHeader className="border-b">
                  <div className="flex items-center gap-3">
                    <div className="from-primary to-accent flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br">
                      <Sparkles className="text-primary-foreground h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{t("ai_assistant")}</CardTitle>
                      <div className="flex items-center gap-2">
                        {liveWorkflow ? <div className="bg-accent h-2 w-2 animate-pulse rounded-full" /> : null}
                        <span className="text-muted-foreground text-xs">
                          {liveWorkflow ? t("online") : t("short_answers")}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          message.role === "user" ? "bg-primary" : "from-primary to-accent bg-gradient-to-br"
                        }`}
                      >
                        {message.role === "user" ? (
                          <User className="text-primary-foreground h-4 w-4" />
                        ) : (
                          <Bot className="text-primary-foreground h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={`flex flex-col gap-2 ${
                          message.role === "user" ? "max-w-[80%] items-end" : "max-w-[85%] items-start"
                        }`}
                      >
                        {message.content ? (
                          message.role === "assistant" ? (
                            <div className="bg-muted/40 w-full rounded-2xl rounded-bl-md border px-3 py-2">
                              <AssistantReply html={formatAssistantReply(message.content)} />
                            </div>
                          ) : (
                            <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md p-3">
                              <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                            </div>
                          )
                        ) : null}
                        {message.cta ? (
                          <Button asChild size="sm" variant="secondary">
                            <a href={supportCtaHref(message.cta)}>{t(`cta.${message.cta}`)}</a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-3">
                      <div className="from-primary to-accent flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br">
                        <Bot className="text-primary-foreground h-4 w-4" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-bl-md p-3">
                        <div className="flex gap-1">
                          <div className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full" />
                          <div className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full delay-100" />
                          <div className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full delay-200" />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
                <div className="border-t p-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {quickActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={isTyping || blockForCaptcha}
                        onClick={() => send(action)}
                        className="bg-muted hover:bg-muted/80 rounded-full px-3 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                  {liveWorkflow && captcha.showTurnstileField ? (
                    <div className="mb-3">
                      <HumanChallengeTurnstile challenge={captcha} keyPrefix="support-" action="support" />
                      <p className="text-muted-foreground mt-1 text-center text-xs">{t("captcha_hint")}</p>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("type_message")}
                      value={inputValue}
                      maxLength={SUPPORT_CHAT_INPUT_MAX}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") send(inputValue);
                      }}
                    />
                    <Button onClick={() => send(inputValue)} disabled={isTyping || !inputValue.trim() || blockForCaptcha}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">{t("secret_notice")}</p>
                  {replySeconds ? (
                    <p className="text-muted-foreground mt-1 text-xs">{t("reply_eta", { seconds: replySeconds })}</p>
                  ) : null}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="text-primary h-5 w-5" />
                    {t("faq.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {faqItems.map((item) => (
                    <div key={item.question} className="space-y-2">
                      <p className="text-sm font-medium">{item.question}</p>
                      <p className="text-muted-foreground text-xs">{item.answer}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("need_help.title")}</CardTitle>
                  <CardDescription>{t("need_help.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a
                    href="mailto:support@aiagents-hub.vn"
                    className="hover:bg-muted flex items-center gap-3 rounded-lg p-3 transition-colors"
                  >
                    <Mail className="text-primary h-5 w-5" />
                    <div>
                      <p className="text-sm font-medium">{t("need_help.email_support")}</p>
                      <p className="text-muted-foreground text-xs">support@aiagents-hub.vn</p>
                    </div>
                  </a>
                  <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                    <Clock className="text-muted-foreground h-5 w-5" />
                    <div>
                      <p className="text-sm font-medium">{t("need_help.response_time")}</p>
                      <p className="text-muted-foreground text-xs">{t("need_help.response_time_value")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Book className="text-primary h-5 w-5" />
                    {t("resources.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { name: t("resources.api_docs"), href: "/docs" },
                    { name: t("resources.getting_started"), href: "/docs/quickstart" },
                    { name: t("resources.credits_guide"), href: "/docs/credits" },
                    { name: t("resources.developer_blog"), href: "/blog" },
                  ].map((resource) => (
                    <a
                      key={resource.name}
                      href={resource.href}
                      className="hover:text-primary block p-2 text-sm transition-colors"
                    >
                      {resource.name}
                    </a>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Support;
