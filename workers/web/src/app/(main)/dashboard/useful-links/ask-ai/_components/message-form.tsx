"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import type { ChatMessageData } from "./ask-ai-chat";
import { MessageFormDynamicField, type DynamicFieldSchema } from "./message-form-field";
import { submitMessageForm, type MessageFormPayload } from "./message-form-submit";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export type FormPayload = MessageFormPayload & {
  schema?: { fields?: DynamicFieldSchema[] };
};

function schemaFromPayload(payload: FormPayload): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const fields = payload.schema?.fields ?? [];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let schema: z.ZodTypeAny = z.string();
    if (f.type === "number") schema = z.coerce.number();
    if (f.type === "boolean") schema = z.boolean();
    if (f.type === "date" || f.type === "datetime") schema = z.string();
    if (f.type === "array") schema = z.array(z.any());
    if (!f.required) schema = schema.optional();
    shape[f.name] = schema;
  }
  return z.object(shape);
}

interface MessageFormProps {
  payload: FormPayload;
  onSuccess?: (result: ChatMessageData) => void;
}

export function MessageForm({ payload, onSuccess }: MessageFormProps) {
  const useModal = payload.displayMode === "modal";
  const [modalOpen, setModalOpen] = React.useState(useModal);
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const formSchema = React.useMemo(() => schemaFromPayload(payload), [payload]);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues:
      payload.schema?.fields?.reduce(
        (acc, f) => {
          if (f.type === "boolean") acc[f.name] = false;
          else if (f.type === "number") acc[f.name] = undefined;
          else acc[f.name] = "";
          return acc;
        },
        {} as Record<string, unknown>,
      ) ?? {},
  });

  const onSubmit = async (values: Record<string, unknown>) => {
    setStatus("loading");
    setError(null);
    try {
      const { data, successMessage } = await submitMessageForm(payload, values, API_BASE_URL);
      setResult(data);
      setStatus("success");
      setModalOpen(false);
      onSuccess?.({
        id: crypto.randomUUID(),
        role: "assistant",
        content: successMessage,
        type: "text",
        payload: data,
        timestamp: new Date(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi");
      setStatus("error");
    }
  };

  const fields = payload.schema?.fields ?? [];
  if (fields.length === 0) return null;

  const formBody = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {fields.map((f) => (
          <FormField
            key={f.name}
            control={form.control}
            name={f.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{f.label ?? f.name}</FormLabel>
                <FormControl>
                  <MessageFormDynamicField f={f} field={field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {status === "success" && result !== null ? (
          <pre className="bg-muted max-h-32 overflow-auto rounded p-2 text-xs">{JSON.stringify(result, null, 2)}</pre>
        ) : null}
        <Button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Đang xử lý..." : "Gửi"}
        </Button>
      </form>
    </Form>
  );

  if (useModal) {
    return (
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{payload.formTitle ?? "Bổ sung thông tin"}</DialogTitle>
          </DialogHeader>
          {formBody}
        </DialogContent>
      </Dialog>
    );
  }

  return <div className="bg-card rounded-lg border p-4">{formBody}</div>;
}
