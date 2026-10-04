"use client";

import { useCallback, useEffect, useState } from "react";

import { KeyRound, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/enterprise/confirm-action";
import type { IssuedToken } from "@/components/enterprise/token-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { memberEnterprise, useEnterpriseErrorMessage, type GrantsView } from "@/lib/enterprise-api";

export type GrantsTarget = { ownerId: string; workflowId: number; workflowName: string };

type RowDraft = { keys: Set<string>; cap: string };

function draftsFrom(view: GrantsView): Record<string, RowDraft> {
  const out: Record<string, RowDraft> = {};
  for (const user of view.proMembers) out[user] = { keys: new Set(), cap: "" };
  for (const g of view.grants) {
    const row = (out[g.granteeUserId] ??= { keys: new Set(), cap: "" });
    row.keys.add(g.triggerKey);
    if (g.monthlyCreditCap != null) row.cap = String(g.monthlyCreditCap);
  }
  return out;
}

export function EnterpriseGrantsSheet({
  target,
  onClose,
  onTokens,
}: {
  target: GrantsTarget | null;
  onClose: () => void;
  onTokens: (tokens: IssuedToken[]) => void;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  return (
    <Sheet open={!!target} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>{t("grants_title")}</SheetTitle>
          <SheetDescription>{target?.workflowName}</SheetDescription>
        </SheetHeader>
        {target ? (
          <GrantsBody key={`${target.ownerId}:${target.workflowId}`} target={target} onTokens={onTokens} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function GrantsBody({ target, onTokens }: { target: GrantsTarget; onTokens: (tokens: IssuedToken[]) => void }) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const errorMessage = useEnterpriseErrorMessage();
  const [view, setView] = useState<GrantsView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [revokeUser, setRevokeUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const v = await memberEnterprise.grants(target.ownerId, target.workflowId);
      setView(v);
      setDrafts(draftsFrom(v));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [target.ownerId, target.workflowId, errorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!view) return <p className="text-muted-foreground p-4 text-sm">{t("loading")}</p>;
  if (view.proMembers.length === 0) return <p className="text-muted-foreground p-4 text-sm">{t("grants_no_pro")}</p>;

  const labelOf = (key: string) => view.triggers.find((tr) => tr.triggerKey === key)?.label ?? key;
  const hasCredential = (user: string, key: string) =>
    view.grants.some((g) => g.granteeUserId === user && g.triggerKey === key && g.hasCredential);
  const isSaved = (user: string, key: string) =>
    view.grants.some((g) => g.granteeUserId === user && g.triggerKey === key);

  const update = (user: string, fn: (row: RowDraft) => RowDraft) =>
    setDrafts((d) => ({ ...d, [user]: fn(d[user] ?? { keys: new Set(), cap: "" }) }));

  const toggle = (user: string, key: string, on: boolean) =>
    update(user, (row) => {
      const keys = new Set(row.keys);
      if (on) keys.add(key);
      else keys.delete(key);
      return { ...row, keys };
    });

  const toggleAll = (user: string, on: boolean) =>
    update(user, (row) => ({ ...row, keys: on ? new Set(view.triggers.map((tr) => tr.triggerKey)) : new Set() }));

  const save = async (user: string) => {
    const row = drafts[user];
    if (!row) return;
    const capText = row.cap.trim();
    const cap = capText === "" ? null : Number(capText);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) {
      toast.error(t("grants_cap_invalid"));
      return;
    }
    setSaving(user);
    try {
      const res = await memberEnterprise.putGrants(target.ownerId, target.workflowId, {
        granteeUserId: user,
        triggerKeys: [...row.keys],
        monthlyCreditCap: cap,
      });
      toast.success(row.keys.size ? t("grants_saved") : t("grants_revoked"));
      if (res.credentials.length) {
        onTokens(res.credentials.map((c) => ({ token: c.token, label: labelOf(c.triggerKey), grantee: user })));
      }
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const reissue = async (user: string, key: string) => {
    try {
      const res = await memberEnterprise.issueCredential(target.ownerId, target.workflowId, {
        triggerKey: key,
        granteeUserId: user,
      });
      onTokens([{ token: res.token, label: labelOf(res.triggerKey), grantee: user }]);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-muted-foreground text-xs">{t("grants_hint")}</p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("grants_col_member")}</TableHead>
              {view.triggers.map((tr) => (
                <TableHead key={tr.triggerKey} className="text-center">
                  <div className="text-xs font-medium">{tr.label}</div>
                  <div className="text-muted-foreground text-[10px]">{t(`kind_${tr.kind}`)}</div>
                </TableHead>
              ))}
              <TableHead className="text-center">{t("grants_col_all")}</TableHead>
              <TableHead>{t("grants_col_cap")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.proMembers.map((user) => {
              const row = drafts[user] ?? { keys: new Set<string>(), cap: "" };
              const all = view.triggers.length > 0 && view.triggers.every((tr) => row.keys.has(tr.triggerKey));
              return (
                <TableRow key={user}>
                  <TableCell className="text-sm">{user}</TableCell>
                  {view.triggers.map((tr) => (
                    <TableCell key={tr.triggerKey} className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Checkbox
                          checked={row.keys.has(tr.triggerKey)}
                          onCheckedChange={(v) => toggle(user, tr.triggerKey, v === true)}
                        />
                        {isSaved(user, tr.triggerKey) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-6 w-6">
                                {hasCredential(user, tr.triggerKey) ? (
                                  <KeyRound className="h-3.5 w-3.5" aria-label={t("grants_has_credential")} />
                                ) : (
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => void reissue(user, tr.triggerKey)}>
                                {t("grants_reissue")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    <Checkbox checked={all} onCheckedChange={(v) => toggleAll(user, v === true)} />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-28"
                      value={row.cap}
                      placeholder={t("grants_cap_none")}
                      onChange={(e) => update(user, (r) => ({ ...r, cap: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      disabled={saving === user}
                      onClick={() =>
                        row.keys.size === 0 && view.grants.some((g) => g.granteeUserId === user)
                          ? setRevokeUser(user)
                          : void save(user)
                      }
                    >
                      {saving === user ? t("saving") : t("save")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ConfirmAction
        open={!!revokeUser}
        onOpenChange={(open) => (open ? undefined : setRevokeUser(null))}
        title={t("grants_revoke_title", { user: revokeUser ?? "" })}
        description={t("grants_revoke_body")}
        confirmLabel={t("grants_revoke")}
        destructive
        onConfirm={async () => {
          if (revokeUser) await save(revokeUser);
        }}
      />
    </div>
  );
}
