"use client";

import { Settings2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfigFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function ConfigField({ label, value, min, max, onChange }: ConfigFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    onChange(Number.isNaN(v) ? min : v);
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={handleChange} />
    </div>
  );
}

interface ConfigCardProps {
  title: string;
  description: string;
  fields: Array<{ key: string; label: string; value: number; min: number; max: number }>;
  onFieldChange: (key: string, value: number) => void;
}

export function ConfigCard({ title, description, fields, onFieldChange }: ConfigCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((f) => (
          <ConfigField
            key={f.key}
            label={f.label}
            value={f.value}
            min={f.min}
            max={f.max}
            onChange={(v) => onFieldChange(f.key, v)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
