"use client";

import { useCallback, useState } from "react";

import {
  ArrowRight,
  BookOpen,
  Clock,
  Copy,
  Headphones,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import Layout from "../components/layout/main-layout";

const CONTACT_EMAIL = "support@aiagents-hub.vn";

const TOPIC_KEYS = ["general", "billing", "technical", "partnership", "other"] as const;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const Contact = () => {
  const t = useTranslations("ContactPage");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<(typeof TOPIC_KEYS)[number]>("general");
  const [message, setMessage] = useState("");

  const copyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      toast.success(t("toast_copy"));
    } catch {
      toast.error(t("toast_copy_fail"));
    }
  }, [t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    const msg = message.trim();
    if (!n) {
      toast.error(t("validation_name"));
      return;
    }
    if (!em || !isValidEmail(em)) {
      toast.error(t("validation_email"));
      return;
    }
    if (msg.length < 8) {
      toast.error(t("validation_message"));
      return;
    }
    const subject = encodeURIComponent(t("mailto_subject", { topic: t(`topics.${topic}`), name: n }));
    const body = encodeURIComponent(
      `${t("mailto_body_header", { name: n, email: em })}\n\n${msg}`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    toast.info(t("toast_opened"));
  };

  const quickTopics = TOPIC_KEYS.filter((k) => k !== "other");

  return (
    <Layout>
      <div className="relative overflow-hidden">
        <div className="from-background via-background to-muted/40 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="bg-primary/15 animate-pulse-slow absolute top-20 -left-20 h-[420px] w-[420px] rounded-full blur-3xl" />
        <div className="bg-accent/15 animate-pulse-slow absolute -right-24 bottom-32 h-[380px] w-[380px] rounded-full blur-3xl delay-1000" />

        <section className="relative z-10 pt-28 pb-10 md:pt-32 md:pb-14">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="bg-primary/10 border-primary/20 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="text-primary text-xs font-semibold tracking-wide uppercase">{t("badge")}</span>
              </div>
              <h1 className="mb-5 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
              </h1>
              <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">{t("subtitle")}</p>
              <div className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
                <Clock className="text-primary h-4 w-4 shrink-0" />
                <span>{t("response_hint")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-12 md:pb-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
              <button
                type="button"
                onClick={copyEmail}
                className="bg-card border-border card-hover group hover:border-primary/40 flex flex-col rounded-2xl border p-5 text-left transition-all duration-300"
              >
                <div className="from-primary/15 to-accent/15 mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br">
                  <Copy className="text-primary h-5 w-5" />
                </div>
                <h3 className="mb-1 font-semibold">{t("cards.copy.title")}</h3>
                <p className="text-muted-foreground mb-3 text-sm leading-relaxed">{t("cards.copy.description")}</p>
                <span className="text-primary mt-auto inline-flex items-center gap-1 text-sm font-medium">
                  {CONTACT_EMAIL}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>

              <Link
                to="/support"
                className="bg-card border-border card-hover hover:border-primary/40 group flex flex-col rounded-2xl border p-5 transition-all duration-300"
              >
                <div className="from-primary/15 to-accent/15 mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br">
                  <Headphones className="text-primary h-5 w-5" />
                </div>
                <h3 className="mb-1 font-semibold">{t("cards.support.title")}</h3>
                <p className="text-muted-foreground mb-3 text-sm leading-relaxed">{t("cards.support.description")}</p>
                <span className="text-primary mt-auto inline-flex items-center gap-1 text-sm font-medium">
                  {t("cards.support.action")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>

              <Link
                to="/docs"
                className="bg-card border-border card-hover hover:border-primary/40 group flex flex-col rounded-2xl border p-5 transition-all duration-300"
              >
                <div className="from-primary/15 to-accent/15 mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br">
                  <BookOpen className="text-primary h-5 w-5" />
                </div>
                <h3 className="mb-1 font-semibold">{t("cards.docs.title")}</h3>
                <p className="text-muted-foreground mb-3 text-sm leading-relaxed">{t("cards.docs.description")}</p>
                <span className="text-primary mt-auto inline-flex items-center gap-1 text-sm font-medium">
                  {t("cards.docs.action")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-border/60 bg-muted/15 relative z-10 border-y py-14 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center md:mb-10">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
                <MessageSquare className="text-primary h-4 w-4" />
                <span className="text-primary text-xs font-medium uppercase">{t("form.kicker")}</span>
              </div>
              <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
                {t("form.title")} <span className="gradient-text">{t("form.title_gradient")}</span>
              </h2>
              <p className="text-muted-foreground text-sm md:text-base">{t("form.subtitle")}</p>
            </div>

            <div className="mx-auto max-w-xl">
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                {quickTopics.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTopic(key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      topic === key
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {t(`topics.${key}`)}
                  </button>
                ))}
              </div>

              <form
                onSubmit={handleSubmit}
                className="border-border bg-card/80 relative overflow-hidden rounded-3xl border p-6 shadow-lg backdrop-blur-sm md:p-8"
              >
                <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-name">{t("form.name_label")}</Label>
                      <Input
                        id="contact-name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("form.name_placeholder")}
                        className="bg-background/80"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">{t("form.email_label")}</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t("form.email_placeholder")}
                        className="bg-background/80"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact-topic">{t("form.topic_label")}</Label>
                    <Select value={topic} onValueChange={(v) => setTopic(v as (typeof TOPIC_KEYS)[number])}>
                      <SelectTrigger id="contact-topic" className="bg-background/80 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOPIC_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>
                            {t(`topics.${key}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact-message">{t("form.message_label")}</Label>
                    <Textarea
                      id="contact-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t("form.message_placeholder")}
                      rows={5}
                      className="bg-background/80 min-h-[120px] resize-y"
                    />
                  </div>

                  <Button type="submit" size="lg" className="group w-full gap-2 shadow-md sm:w-auto">
                    <Send className="h-4 w-4" />
                    {t("form.submit")}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>

                  <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t("form.mailto_note")}
                  </p>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Contact;
