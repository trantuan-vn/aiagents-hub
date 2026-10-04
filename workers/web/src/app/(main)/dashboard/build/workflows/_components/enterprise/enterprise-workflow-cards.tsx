"use client";

import { Calendar, FileText, KeyRound, MessageSquare, Webhook } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CatalogCard, EnterpriseTrigger, TriggerKind } from "@/lib/enterprise-api";

export type Decision = "accept" | "reject" | "release";

const KIND_ICON: Record<TriggerKind, typeof MessageSquare> = {
  chat: MessageSquare,
  form: FileText,
  webhook: Webhook,
  schedule: Calendar,
};

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function ProposalCard({ card, onDecide }: { card: CatalogCard; onDecide: (d: Decision) => void }) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{card.name}</CardTitle>
        <CardDescription>
          {card.ownerIdentifier ?? card.ownerId} · {t("trigger_count", { count: card.triggers.length })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {card.description ? <p className="text-sm">{card.description}</p> : null}
        <p className="text-muted-foreground text-xs">{t("royalty_explain", { percent: card.royaltyPercent ?? 0 })}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onDecide("accept")}>
            {t("accept")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDecide("reject")}>
            {t("reject")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type WorkflowCardProps = {
  card: CatalogCard;
  isBusiness: boolean;
  onRun: (trigger: EnterpriseTrigger) => void;
  onGrants: () => void;
  onIssueCredential: (trigger: EnterpriseTrigger) => void;
  onRelease: () => void;
};

export function WorkflowCard({ card, isBusiness, onRun, onGrants, onIssueCredential, onRelease }: WorkflowCardProps) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const tags = parseTags(card.tags);
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{card.name}</CardTitle>
        <CardDescription>{card.ownerIdentifier ?? card.ownerId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {card.description ? <p className="text-muted-foreground line-clamp-3 text-sm">{card.description}</p> : null}
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
          {card.royaltyPercent == null ? null : (
            <Badge variant="secondary" className="text-[10px]">
              {t("royalty_badge", { percent: card.royaltyPercent })}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {card.triggers.map((tr) => {
            const Icon = KIND_ICON[tr.kind];
            return (
              <Button key={tr.triggerKey} size="sm" variant="secondary" onClick={() => onRun(tr)}>
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {t(`action_${tr.kind}`)}
                <span className="text-muted-foreground ml-1 max-w-32 truncate">· {tr.label}</span>
              </Button>
            );
          })}
        </div>
        {isBusiness ? (
          <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" variant="outline" onClick={onGrants}>
              {t("grants")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={card.triggers.length === 0}>
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                  {t("my_credential")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{t("my_credential_pick")}</DropdownMenuLabel>
                {card.triggers.map((tr) => (
                  <DropdownMenuItem key={tr.triggerKey} onClick={() => onIssueCredential(tr)}>
                    {tr.label} ({t(`kind_${tr.kind}`)})
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onRelease}>
              {t("release")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
