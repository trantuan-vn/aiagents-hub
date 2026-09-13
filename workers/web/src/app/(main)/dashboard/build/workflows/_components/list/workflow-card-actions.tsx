"use client";

import { useMemo, useState } from "react";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { AgentWorkflow } from "../../_lib/api";
import {
  parseWorkflowListTriggerActions,
  type WorkflowListFormAction,
  type WorkflowListWebhookAction,
} from "../../_lib/workflow-list-triggers";

import { WorkflowWebhookIntegrateDialog } from "./workflow-webhook-integrate-dialog";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function WorkflowExecuteFlowButton({
  form,
  webhook,
  onOpenWebhook,
}: {
  form: WorkflowListFormAction | undefined;
  webhook: WorkflowListWebhookAction | undefined;
  onOpenWebhook: () => void;
}) {
  const t = useTranslations("WorkflowsPage");
  if (form && webhook) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" aria-label={t("execute_choose_trigger")}>
            {t("execute")}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => openExternal(form.url)}>{t("execute_trigger_form")}</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              window.setTimeout(onOpenWebhook, 0);
            }}
          >
            {t("execute_trigger_webhook")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  if (form) {
    return (
      <Button size="sm" variant="outline" asChild>
        <a href={form.url} target="_blank" rel="noopener noreferrer">
          {t("execute")}
        </a>
      </Button>
    );
  }
  if (webhook) {
    return (
      <Button size="sm" variant="outline" onClick={onOpenWebhook}>
        {t("execute")}
      </Button>
    );
  }
  return null;
}

function WorkflowOpenChatButton({ publicChat, url }: { publicChat: boolean; url: string }) {
  const t = useTranslations("WorkflowsPage");
  if (publicChat) {
    return (
      <Button size="sm" variant="ghost" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {t("open_chat")}
        </a>
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button size="sm" variant="ghost" disabled>
            {t("open_chat")}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("open_chat_not_public")}</TooltipContent>
    </Tooltip>
  );
}

interface WorkflowCardActionsProps {
  wf: AgentWorkflow;
}

export function WorkflowCardActions({ wf }: WorkflowCardActionsProps) {
  const user = useDashboardUser();
  const ownerId = user?.clientId ?? user?.id;
  const [webhookOpen, setWebhookOpen] = useState(false);

  const actions = useMemo(
    () =>
      parseWorkflowListTriggerActions(wf.definition, {
        workflowId: wf.id ?? 0,
        ownerId,
      }),
    [ownerId, wf.definition, wf.id],
  );

  const form = actions.forms.at(0);
  const webhook = actions.webhooks.at(0);

  return (
    <>
      <WorkflowExecuteFlowButton form={form} webhook={webhook} onOpenWebhook={() => setWebhookOpen(true)} />
      {actions.chat ? <WorkflowOpenChatButton publicChat={actions.chat.public} url={actions.chat.url} /> : null}
      <WorkflowWebhookIntegrateDialog
        webhook={webhook ?? null}
        clientId={ownerId}
        open={webhookOpen}
        onOpenChange={setWebhookOpen}
      />
    </>
  );
}
