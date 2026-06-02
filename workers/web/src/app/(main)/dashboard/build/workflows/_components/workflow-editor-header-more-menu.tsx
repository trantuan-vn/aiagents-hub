"use client";

import { useRef } from "react";

import {
  Copy,
  Download,
  FileUp,
  Heart,
  MoreHorizontal,
  Pencil,
  Settings2,
  Share2,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface WorkflowEditorHeaderMoreMenuProps {
  onEditName: () => void;
  onEditNote: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onShare: () => void;
  onFavorite: () => void;
  onImportFile: (file: File) => void;
  onOpenSettings: () => void;
  onDelete: () => void;
}

export function WorkflowEditorHeaderMoreMenu({
  onEditName,
  onEditNote,
  onDuplicate,
  onDownload,
  onShare,
  onFavorite,
  onImportFile,
  onOpenSettings,
  onDelete,
}: WorkflowEditorHeaderMoreMenuProps) {
  const t = useTranslations("WorkflowEditorPage");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8">
            <MoreHorizontal className="size-3.5" />
            <span className="sr-only">{t("more_menu")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onEditName}>
            <Pencil className="mr-2 size-3.5" />
            {t("menu_edit_name")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEditNote}>
            <StickyNote className="mr-2 size-3.5" />
            {t("menu_edit_note")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 size-3.5" />
            {t("menu_duplicate")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDownload}>
            <Download className="mr-2 size-3.5" />
            {t("menu_download")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShare}>
            <Share2 className="mr-2 size-3.5" />
            {t("menu_share")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onFavorite}>
            <Heart className="mr-2 size-3.5" />
            {t("menu_favorite")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <FileUp className="mr-2 size-3.5" />
            {t("menu_import_file")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenSettings}>
            <Settings2 className="mr-2 size-3.5" />
            {t("settings_title")}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 size-3.5" />
            {t("menu_delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
