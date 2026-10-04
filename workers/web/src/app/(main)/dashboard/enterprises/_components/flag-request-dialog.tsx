"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminFlags, type AdminFlagRequestDetail } from "@/lib/enterprise-admin-api";
import { useEnterpriseErrorMessage } from "@/lib/enterprise-api";

import { WorkflowExecutionGraph } from "../../build/workflows/_components/panels/workflow-panels/workflow-execution-graph";
import type { WorkflowExecutionGraph as GraphDefinition } from "../../build/workflows/_lib/api";

type Props = {
  requestId: string | null;
  onClose: () => void;
  onResolved: () => void;
};

function parseGraph(raw: string | undefined): GraphDefinition | undefined {
  if (!raw) return undefined;
  try {
    const doc = JSON.parse(raw) as GraphDefinition;
    return Array.isArray(doc.nodes) ? doc : undefined;
  } catch {
    return undefined;
  }
}

function parseTags(raw: string | undefined): string[] {
  try {
    const tags = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(tags) ? tags.map(String) : [];
  } catch {
    return [];
  }
}

/** §3.0: the graph as it stands on the owner's UserDO, view only. */
export function FlagRequestDialog({ requestId, onClose, onResolved }: Props) {
  const t = useTranslations("EnterpriseAdminPage");
  const errorMessage = useEnterpriseErrorMessage();
  const [detail, setDetail] = useState<AdminFlagRequestDetail | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setDetail(null);
    setRejecting(false);
    setReason("");
    if (!requestId) return;
    adminFlags
      .get(requestId)
      .then(setDetail)
      .catch((err: unknown) => {
        toast.error(errorMessage(err));
        closeRef.current();
      });
  }, [requestId, errorMessage]);

  const resolve = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      onResolved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!detail && !busy;
  const approve = () => {
    if (detail) void resolve(() => adminFlags.approve(detail.request.id), t("approved"));
  };
  const reject = () => {
    if (detail) void resolve(() => adminFlags.reject(detail.request.id, reason.trim()), t("rejected"));
  };

  return (
    <Dialog open={!!requestId} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{detail?.workflow.name ?? t("loading")}</DialogTitle>
          <DialogDescription>{t("review_description")}</DialogDescription>
        </DialogHeader>
        {detail ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <FlagRequestOverview detail={detail} />
            {rejecting ? (
              <div className="space-y-2">
                <Label htmlFor="reject-reason">{t("reject_reason")}</Label>
                <Textarea
                  id="reject-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">{t("loading")}</p>
        )}
        <DialogFooter>
          {rejecting ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(false)}>
                {t("cancel")}
              </Button>
              <Button variant="destructive" disabled={!ready || !reason.trim()} onClick={reject}>
                {t("reject")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={!ready} onClick={() => setRejecting(true)}>
                {t("reject")}
              </Button>
              <Button disabled={!ready} onClick={approve}>
                {t("approve")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagRequestOverview({ detail }: { detail: AdminFlagRequestDetail }) {
  const t = useTranslations("EnterpriseAdminPage");
  const graph = useMemo(() => parseGraph(detail.workflow.definition), [detail]);
  const tags = useMemo(() => parseTags(detail.workflow.tags), [detail]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">
          {t(`wf_status_${detail.workflow.status === "published" ? "published" : "draft"}`)}
        </Badge>
        {detail.workflow.isShared ? <Badge variant="secondary">{t("shared")}</Badge> : null}
        {tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
      {detail.workflow.description ? (
        <p className="text-muted-foreground text-sm">{detail.workflow.description}</p>
      ) : null}
      {detail.request.note ? (
        <div className="rounded-lg border p-3 text-sm">
          <p className="text-muted-foreground mb-1 text-xs">{t("owner_note")}</p>
          <p className="whitespace-pre-wrap">{detail.request.note}</p>
        </div>
      ) : null}
      <div className="flex h-[55vh] min-h-[320px] overflow-hidden rounded-lg border">
        {graph ? (
          <WorkflowExecutionGraph
            executionKey={`flag-${detail.request.id}`}
            definition={graph}
            steps={[]}
            selectedNodeId={null}
            running={false}
            onSelectNode={() => undefined}
          />
        ) : (
          <p className="text-muted-foreground m-auto text-sm">{t("graph_unavailable")}</p>
        )}
      </div>
    </>
  );
}
