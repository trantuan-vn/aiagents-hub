"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { ChatMessageData } from "./ask-ai-chat";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface FormFieldSchema {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

interface FormPayload {
  endpoint?: string;
  method?: string;
  schema?: {
    fields?: FormFieldSchema[];
  };
}

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
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const formSchema = React.useMemo(() => schemaFromPayload(payload), [payload]);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues:
      payload.schema?.fields?.reduce(
        (acc, f) => {
          acc[f.name] = f.type === "boolean" ? false : "";
          return acc;
        },
        {} as Record<string, unknown>,
      ) ?? {},
  });

  const onSubmit = async (values: Record<string, unknown>) => {
    setStatus("loading");
    setError(null);
    try {
      const endpoint = payload.endpoint ?? "";
      const isLogs = endpoint.includes("/dashboard/monitor/logs");
      let finalValues = values;

      if (payload.method === "GET") {
        finalValues = { ...values };
        if (isLogs) {
          const toTimestamp = (key: string) => {
            const v = finalValues[key];
            if (v && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
              const d =
                key === "dateTo"
                  ? (() => {
                      const x = new Date(v);
                      x.setHours(23, 59, 59, 999);
                      return x;
                    })()
                  : new Date(v);
              finalValues[key] = String(d.getTime());
            }
          };
          toTimestamp("dateFrom");
          toTimestamp("dateTo");
        }
        const params = new URLSearchParams(
          Object.entries(finalValues).reduce(
            (acc, [k, v]) => {
              if (v != null && v !== "") acc[k] = String(v);
              return acc;
            },
            {} as Record<string, string>,
          ),
        );
        const url = `${API_BASE_URL}${endpoint}${params.toString() ? `?${params}` : ""}`;
        const res = await fetch(url, { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
          error?: string;
          message?: string;
        };
        if (!res.ok) throw new Error(data.error ?? data.message ?? "Request failed");
        setResult(data);
        setStatus("success");
        onSuccess?.({
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Thao tác thành công.",
          type: "text",
          payload: data,
          timestamp: new Date(),
        });
        return;
      }

      const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
      const res = await fetch(url, {
        method: (payload.method ?? "POST") as "GET" | "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(finalValues),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? "Request failed");
      }
      setResult(data);
      setStatus("success");
      onSuccess?.({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Thao tác thành công.",
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

  const renderField = (f: FormFieldSchema, field: { value: unknown; onChange: (v: unknown) => void }) => {
    if (f.type === "date") {
      return (
        <Input
          type="date"
          value={(field.value as string) ?? ""}
          onChange={(e) => field.onChange(e.target.value || undefined)}
          placeholder={f.placeholder}
        />
      );
    }
    if (f.type === "datetime") {
      return (
        <Input
          type="datetime-local"
          value={(field.value as string) ?? ""}
          onChange={(e) => field.onChange(e.target.value || undefined)}
          placeholder={f.placeholder}
        />
      );
    }
    if (f.type === "boolean") {
      return <Switch checked={!!field.value} onCheckedChange={(v) => field.onChange(v)} />;
    }
    if (f.type === "select" && f.options && f.options.length > 0) {
      return (
        <Select value={(field.value as string) ?? ""} onValueChange={(v) => field.onChange(v)}>
          <SelectTrigger>
            <SelectValue placeholder={f.placeholder ?? `Chọn ${f.label ?? f.name}`} />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label ?? opt.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={f.type === "number" ? "number" : "text"}
        placeholder={f.placeholder ?? f.label ?? f.name}
        value={(field.value ?? "") as string}
        onChange={(e) =>
          field.onChange(f.type === "number" ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value)
        }
      />
    );
  };

  return (
    <div className="bg-card rounded-lg border p-4">
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
                  <FormControl>{renderField(f, field)}</FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          {error && <p className="text-destructive text-sm">{error}</p>}
          {status === "success" && result !== null && (
            <pre className="bg-muted max-h-32 overflow-auto rounded p-2 text-xs">{JSON.stringify(result, null, 2)}</pre>
          )}
          <Button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Đang xử lý..." : "Gửi"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
