"use client";

import type { ReactNode } from "react";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Shared building blocks of the admin area so every page composes the same
// way: header with actions, summary tiles before detail, one table style,
// pills for state, dialogs (never browser prompts) for confirmations.

export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneText: Record<Tone, string> = {
  neutral: "",
  success: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "text-red-700 dark:text-red-400",
  info: "text-sky-700 dark:text-sky-400",
};

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneText[tone])}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const pillTone: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  danger: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

// One table look for the whole admin: bordered card, muted uppercase header,
// hover rows, wide content scrolls inside the card.
export function DataTable({
  columns,
  children,
  isLoading,
  isEmpty,
  emptyMessage,
}: {
  columns: { label: ReactNode; className?: string }[];
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col, i) => (
              <TableHead
                key={i}
                className={cn(
                  "h-10 whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground",
                  col.className,
                )}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-10 text-center">
                <Spinner className="mx-auto h-5 w-5" />
              </TableCell>
            </TableRow>
          ) : isEmpty ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                {emptyMessage ?? "Sin resultados."}
              </TableCell>
            </TableRow>
          ) : (
            children
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <TableRow className={cn("align-top", className)}>{children}</TableRow>;
}

export function Cell({
  children,
  className,
  numeric,
}: {
  children?: ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <TableCell className={cn("py-3", numeric && "text-right tabular-nums", className)}>
      {children}
    </TableCell>
  );
}

// Primary + secondary line inside a cell (name over email, date over time).
export function CellStack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{primary}</div>
      {secondary ? <div className="truncate text-xs text-muted-foreground">{secondary}</div> : null}
    </div>
  );
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-1.5">{children}</div>;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  // eslint-disable-next-line no-unused-vars
  onPageChange: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground tabular-nums">
        {total === 0 ? "Sin registros" : `${from}–${to} de ${total}`}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page * pageSize >= total}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

// In-app confirmation. Replaces window.confirm everywhere in the admin.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive,
  pending,
  onConfirm,
  children,
}: {
  open: boolean;
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? <Spinner className="h-4 w-4" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Labelled form field used inside dialogs.
export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

// Status vocabularies shared by tables and dialogs.
export const ACTIVATION_STATUS: Record<
  "PENDING" | "APPROVED" | "EXPIRED" | "REJECTED" | "CANCELLED",
  { label: string; tone: Tone }
> = {
  PENDING: { label: "Pendiente", tone: "warning" },
  APPROVED: { label: "Activa", tone: "success" },
  EXPIRED: { label: "Vencida", tone: "danger" },
  REJECTED: { label: "Rechazada", tone: "danger" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
};

export const INVOICE_STATUS: Record<
  "ISSUED" | "PAID" | "VOID",
  { label: string; tone: Tone }
> = {
  ISSUED: { label: "Pendiente", tone: "warning" },
  PAID: { label: "Pagada", tone: "success" },
  VOID: { label: "Anulada", tone: "neutral" },
};

export function savePdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
