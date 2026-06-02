"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import Link from "next/link";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface WorkflowEditorHeaderLeftProps {
  workflowName: string;
  onWorkflowNameChange?: (name: string) => void;
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  readOnly: boolean;
  backHref: string;
  backLabel: string;
  headerMeta?: ReactNode;
  nameInputRef?: React.RefObject<HTMLInputElement>;
}

export function WorkflowEditorHeaderLeft({
  workflowName,
  onWorkflowNameChange,
  tags = [],
  onTagsChange,
  readOnly,
  backHref,
  backLabel,
  headerMeta,
  nameInputRef,
}: WorkflowEditorHeaderLeftProps) {
  const te = useTranslations("WorkflowEditorPage");
  const untitledLabel = te("untitled");
  const [tagDraft, setTagDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const localNameRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const nameRef = nameInputRef ?? localNameRef;
  const nameValue = workflowName || untitledLabel;
  const nameInputWidthCh = Math.min(Math.max(nameValue.length + 1, 6), 28);

  const commitTag = useCallback(() => {
    const label = tagDraft.trim();
    setTagDraft("");
    setAddingTag(false);
    if (!label || !onTagsChange) return;
    if (tags.includes(label)) return;
    onTagsChange([...tags, label]);
  }, [tagDraft, onTagsChange, tags]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Button variant="ghost" size="sm" className="text-muted-foreground h-8 shrink-0 px-2 text-xs" asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
      <span className="text-muted-foreground shrink-0 text-xs">/</span>
      {readOnly ? (
        <span className="truncate text-sm font-medium">{nameValue}</span>
      ) : (
        <Input
          ref={nameRef}
          value={workflowName}
          onChange={(e) => onWorkflowNameChange?.(e.target.value)}
          placeholder={untitledLabel}
          style={{ width: `${nameInputWidthCh}ch` }}
          className="h-8 w-auto max-w-[220px] min-w-[6ch] shrink-0 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-1"
        />
      )}
      {readOnly ? (
        <span className="bg-muted text-muted-foreground hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline">
          {te("view_readonly")}
        </span>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="h-6 gap-0.5 pr-1 text-[10px] font-normal">
              {tag}
              <button
                type="button"
                className="hover:bg-muted rounded p-0.5"
                aria-label={te("remove_tag", { tag })}
                onClick={() => onTagsChange?.(tags.filter((t) => t !== tag))}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
          {addingTag ? (
            <Input
              autoFocus
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onBlur={() => commitTag()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTag();
                }
                if (e.key === "Escape") {
                  setTagDraft("");
                  setAddingTag(false);
                }
              }}
              className="h-6 w-24 px-1.5 text-[10px]"
              placeholder={te("tag_placeholder")}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 shrink-0 gap-1 px-2 text-xs"
              onClick={() => setAddingTag(true)}
            >
              <Plus className="size-3" />
              {te("add_tag")}
            </Button>
          )}
        </div>
      )}
      {headerMeta ? (
        <div className={cn("hidden min-w-0 items-center gap-2 lg:flex", readOnly && "lg:flex")}>{headerMeta}</div>
      ) : null}
    </div>
  );
}
