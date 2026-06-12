"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { ServicePermissionPicker } from "./service-permission-picker";

export type PermissionItem = {
  path: string;
  labelKey?: string;
  label?: string;
  description?: string;
};

export type PermissionGroup = {
  id: string;
  labelKey: string;
  permissions: PermissionItem[];
};

type PermissionSelectorProps = {
  groups: PermissionGroup[];
  value: string[];
  onChange: (permissions: string[]) => void;
};

function StaticPermissionGroup({
  group,
  value,
  onChange,
  t,
}: {
  group: PermissionGroup;
  value: string[];
  onChange: (permissions: string[]) => void;
  t: ReturnType<typeof useTranslations<"TokenPage">>;
}) {
  const toggle = (path: string, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...value, path])]);
      return;
    }
    onChange(value.filter((p) => p !== path));
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{t(group.labelKey as Parameters<typeof t>[0])}</p>
      <div className="space-y-2">
        {group.permissions.map((perm) => {
          const id = `perm-${perm.path}`;
          const checked = value.includes(perm.path);
          const title =
            perm.label ?? (perm.labelKey ? t(perm.labelKey as Parameters<typeof t>[0]) : perm.path);
          return (
            <div key={perm.path} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(v) => toggle(perm.path, v === true)}
              />
              <div className="grid gap-0.5 leading-none">
                <Label htmlFor={id} className="text-sm font-normal">
                  {title}
                </Label>
                <span className="text-muted-foreground font-mono text-[11px]">{perm.path}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PermissionSelector({ groups, value, onChange }: PermissionSelectorProps) {
  const t = useTranslations("TokenPage");

  if (groups.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("permissions_loading")}</p>;
  }

  const serviceGroup = groups.find((g) => g.id === "service");
  const staticGroups = groups.filter((g) => g.id !== "service");

  return (
    <div className="space-y-3">
      {staticGroups.map((group) => (
        <StaticPermissionGroup key={group.id} group={group} value={value} onChange={onChange} t={t} />
      ))}
      {serviceGroup ? (
        <ServicePermissionPicker
          services={serviceGroup.permissions}
          value={value}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}
