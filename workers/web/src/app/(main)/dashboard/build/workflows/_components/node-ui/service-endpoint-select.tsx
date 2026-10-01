"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useApprovedServices } from "../hooks/use-approved-services";
import type { Service } from "../../../../service/_components/schema";

interface ServiceEndpointSelectProps {
  value: string;
  onChange: (endpoint: string) => void;
  id?: string;
  capability?: "embed" | "chat";
  hideHints?: boolean;
}

function isEmbeddingService(service: Service): boolean {
  const blob = `${service.model ?? ""} ${service.endpoint ?? ""} ${service.name ?? ""}`.toLowerCase();
  return blob.includes("bge") || blob.includes("embed");
}

export function ServiceEndpointSelect({
  value,
  onChange,
  id,
  capability,
  hideHints,
}: ServiceEndpointSelectProps) {
  const t = useTranslations("WorkflowEditorPage");
  const { services: approved, loading } = useApprovedServices();
  const services = useMemo(
    () => (capability === "embed" ? approved.filter(isEmbeddingService) : approved),
    [approved, capability],
  );
  const firstEndpoint = services[0]?.endpoint ?? "";
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (capability !== "embed" || value || loading || !firstEndpoint) return;
    onChangeRef.current(firstEndpoint);
  }, [capability, value, loading, firstEndpoint]);

  const placeholder = loading
    ? t("service_select_loading")
    : services.length === 0
      ? t("service_select_empty")
      : t("service_select_placeholder");

  return (
    <div className="space-y-2">
      {id ? <Label htmlFor={id}>{t("agent_service_endpoint")}</Label> : null}
      <Select value={value || undefined} onValueChange={onChange} disabled={loading || services.length === 0}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {services.map((s) => (
            <SelectItem key={String(s.id ?? s.endpoint)} value={s.endpoint}>
              <span className="font-medium">{s.name}</span>
              {s.model ? (
                <span className="text-muted-foreground ml-2 text-xs">{s.model}</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hideHints ? null : (
        <>
          <p className="text-muted-foreground text-xs">{t("agent_model_hint")}</p>
          <p className="text-muted-foreground text-xs">{t("service_select_hint")}</p>
        </>
      )}
    </div>
  );
}
