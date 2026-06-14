"use client";

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

interface ServiceEndpointSelectProps {
  value: string;
  onChange: (endpoint: string) => void;
  id?: string;
}

export function ServiceEndpointSelect({ value, onChange, id }: ServiceEndpointSelectProps) {
  const t = useTranslations("WorkflowEditorPage");
  const { services, loading } = useApprovedServices();

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
      <p className="text-muted-foreground text-xs">{t("agent_model_hint")}</p>
      <p className="text-muted-foreground text-xs">{t("service_select_hint")}</p>
    </div>
  );
}
