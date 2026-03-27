"use client";

import { useState } from "react";

import { MessageCircle, Send, Bot, User, Book, HelpCircle, Mail, Clock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import Layout from "../components/layout/main-layout";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const Support = () => {
  const t = useTranslations("SupportPage");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content: t("ai_responses.welcome"),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const quickActions = [
    t("quick_actions.recommend_api"),
    t("quick_actions.calls_left"),
    t("quick_actions.rate_limiting"),
    t("quick_actions.upgrade"),
  ];

  const faqItems = [
    {
      question: t("faq.generate_key.question"),
      answer: t("faq.generate_key.answer"),
    },
    {
      question: t("faq.rate_limit.question"),
      answer: t("faq.rate_limit.answer"),
    },
    {
      question: t("faq.change_plan.question"),
      answer: t("faq.change_plan.answer"),
    },
    {
      question: t("faq.free_trial.question"),
      answer: t("faq.free_trial.answer"),
    },
  ];

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      role: "user",
      content: inputValue,
    };
    setMessages([...messages, userMessage]);
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      const aiMessage: Message = {
        id: messages.length + 2,
        role: "assistant",
        content: getAIResponse(inputValue),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const getAIResponse = (query: string): string => {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("recommend") || lowerQuery.includes("suggest") || lowerQuery.includes("đề xuất")) {
      return t("ai_responses.recommend");
    }
    if (lowerQuery.includes("calls") || lowerQuery.includes("quota") || lowerQuery.includes("lượt gọi")) {
      return t("ai_responses.calls");
    }
    if (lowerQuery.includes("rate limit") || lowerQuery.includes("giới hạn")) {
      return t("ai_responses.rate_limit");
    }
    return t("ai_responses.default", { query });
  };

  const handleQuickAction = (action: string) => {
    setInputValue(action);
  };

  return (
    <Layout>
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
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
            {/* Chat Section */}
            <div className="lg:col-span-2">
              <Card className="flex h-[600px] flex-col">
                <CardHeader className="border-b">
                  <div className="flex items-center gap-3">
                    <div className="from-primary to-accent flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br">
                      <Sparkles className="text-primary-foreground h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{t("ai_assistant")}</CardTitle>
                      <div className="flex items-center gap-2">
                        <div className="bg-accent h-2 w-2 animate-pulse rounded-full" />
                        <span className="text-muted-foreground text-xs">{t("online")}</span>
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
                        className={`max-w-[80%] rounded-2xl p-3 ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
                  {/* Quick Actions */}
                  <div className="mb-3 flex flex-wrap gap-2">
                    {quickActions.map((action) => (
                      <button
                        key={action}
                        onClick={() => handleQuickAction(action)}
                        className="bg-muted hover:bg-muted/80 rounded-full px-3 py-1.5 text-xs transition-colors"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                  {/* Input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("type_message")}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    />
                    <Button onClick={handleSend} disabled={!inputValue.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* FAQ */}
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

              {/* Contact Options */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("need_help.title")}</CardTitle>
                  <CardDescription>{t("need_help.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a
                    href="mailto:admin@unitoken.trade"
                    className="hover:bg-muted flex items-center gap-3 rounded-lg p-3 transition-colors"
                  >
                    <Mail className="text-primary h-5 w-5" />
                    <div>
                      <p className="text-sm font-medium">{t("need_help.email_support")}</p>
                      <p className="text-muted-foreground text-xs">admin@unitoken.trade</p>
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

              {/* Resources */}
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
