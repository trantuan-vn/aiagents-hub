"use client";

import { useState } from "react";

import { AlertCircle, Send, Users, User, Radio } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

type TargetMode = "single" | "multiple" | "all";
type Channel = "broadcast" | "queue";

export default function NotifyPage() {
  const t = useTranslations("NotifyPage");
  const { toast } = useToast();
  const [targetMode, setTargetMode] = useState<TargetMode>("single");
  const [channel, setChannel] = useState<Channel>("broadcast");

  const handleChannelChange = (v: Channel) => {
    setChannel(v);
    if (v === "queue" && targetMode === "all") setTargetMode("single");
  };
  const [singleUser, setSingleUser] = useState("");
  const [multipleUsers, setMultipleUsers] = useState("");
  const [messageContent, setMessageContent] = useState(
    JSON.stringify({ title: "Notification", body: "Your message here", data: {} }, null, 2),
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseMessage = (): unknown => {
    const trimmed = messageContent.trim();
    if (!trimmed) return { message: "" };
    try {
      return JSON.parse(trimmed);
    } catch {
      return { message: trimmed };
    }
  };

  const getTargetIdentifiers = (): string[] | null => {
    if (targetMode === "all") return null;
    if (targetMode === "single") {
      const id = singleUser.trim();
      return id ? [id] : [];
    }
    return multipleUsers
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const parseErrorResponse = (errData: unknown): string => {
    if (errData && typeof errData === "object" && "error" in errData) {
      const err = (errData as { error?: string }).error;
      return typeof err === "string" ? err : "";
    }
    return "";
  };

  const sendBroadcast = async (identifiers: string[] | null, message: unknown) => {
    const body: Record<string, unknown> = { message };
    if (identifiers && identifiers.length > 0) body.targetIdentifiers = identifiers;
    const res = await fetch(`${API_BASE_URL}/dashboard/ws/broadcast`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(parseErrorResponse(errData) || res.statusText);
    }
    toast({
      title: t("broadcast_success"),
      description: identifiers
        ? t("broadcast_success_desc", { count: identifiers.length })
        : t("broadcast_success_all"),
    });
  };

  const sendQueue = async (identifiers: string[], message: unknown) => {
    const res = await fetch(`${API_BASE_URL}/dashboard/ws/queue/push`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "broadcast",
        targetIdentifiers: identifiers,
        message,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(parseErrorResponse(errData) || res.statusText);
    }
    await res.json();
    const count = identifiers.length;
    toast({
      title: t("queue_success"),
      description: t("queue_success_desc", { count }),
    });
  };

  const handleSend = async () => {
    setError(null);
    const identifiers = getTargetIdentifiers();

    if (targetMode !== "all" && (!identifiers || identifiers.length === 0)) {
      setError(t("error_target_required"));
      toast({ title: t("error"), description: t("error_target_required"), variant: "destructive" });
      return;
    }

    const message = parseMessage();
    setIsSending(true);

    try {
      if (channel === "broadcast") {
        await sendBroadcast(identifiers, message);
      } else {
        if (!identifiers || identifiers.length === 0) {
          throw new Error(t("error_queue_requires_targets"));
        }
        await sendQueue(identifiers, message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("send_error");
      setError(msg);
      toast({ title: t("error"), description: msg, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("description")}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("message_content")}</CardTitle>
            <CardDescription>{t("message_content_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder={t("message_placeholder")}
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("target_audience")}</CardTitle>
            <CardDescription>{t("target_audience_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup value={targetMode} onValueChange={(v) => setTargetMode(v as TargetMode)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="target-single" />
                <Label htmlFor="target-single" className="flex cursor-pointer items-center gap-2">
                  <User className="h-4 w-4" />
                  {t("target_single")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="multiple" id="target-multiple" />
                <Label htmlFor="target-multiple" className="flex cursor-pointer items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t("target_multiple")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="target-all" disabled={channel === "queue"} />
                <Label
                  htmlFor="target-all"
                  className={`flex cursor-pointer items-center gap-2 ${channel === "queue" ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <Radio className="h-4 w-4" />
                  {t("target_all")}
                </Label>
              </div>
            </RadioGroup>

            {targetMode === "single" && (
              <div className="space-y-2">
                <Label htmlFor="single-user">{t("user_identifier")}</Label>
                <input
                  id="single-user"
                  type="text"
                  placeholder="user@example.com"
                  value={singleUser}
                  onChange={(e) => setSingleUser(e.target.value)}
                  className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:ring-2"
                />
              </div>
            )}

            {targetMode === "multiple" && (
              <div className="space-y-2">
                <Label htmlFor="multiple-users">{t("user_identifiers")}</Label>
                <Textarea
                  id="multiple-users"
                  placeholder="user1@example.com&#10;user2@example.com"
                  value={multipleUsers}
                  onChange={(e) => setMultipleUsers(e.target.value)}
                  className="min-h-[100px] text-sm"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("channel")}</CardTitle>
          <CardDescription>{t("channel_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={channel} onValueChange={(v) => handleChannelChange(v as Channel)}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="broadcast">{t("channel_broadcast")}</TabsTrigger>
              <TabsTrigger value="queue">{t("channel_queue")}</TabsTrigger>
            </TabsList>
            <TabsContent value="broadcast" className="mt-3">
              <p className="text-muted-foreground text-sm">{t("channel_broadcast_desc")}</p>
            </TabsContent>
            <TabsContent value="queue" className="mt-3">
              <p className="text-muted-foreground text-sm">{t("channel_queue_desc")}</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSend} disabled={isSending}>
          <Send className="mr-2 h-4 w-4" />
          {isSending ? t("sending") : t("send")}
        </Button>
      </div>
    </div>
  );
}
