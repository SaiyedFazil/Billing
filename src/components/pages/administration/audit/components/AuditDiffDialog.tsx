"use client";

import {
  ArrowRight,
  BookOpenText,
  ChevronRight,
  Clock,
  History,
  IndianRupee,
  Info,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  Package,
  ReceiptText,
  ShieldAlert,
  Sparkles,
  Store,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";
import { cn } from "@/lib/utils";
import { describeAuditEntry } from "@/lib/utils/audit-details";
import { initials } from "@/lib/utils/initials";
import type {
  AuditLogEntry,
  AuditRefs,
  AuditText,
  AuditTone,
} from "@/types/audit.types";

const SECTION_LABEL =
  "text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase";

/** A label column beside a value column, stacked on a phone. */
const ROW =
  "grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)] sm:gap-4";

const TONES: Record<AuditTone, string> = {
  created: "bg-success-soft text-success-ink",
  updated: "bg-brand-soft text-brand-ink",
  removed: "bg-destructive-soft text-destructive-ink",
  security: "bg-warning-soft text-warning-ink",
  event: "bg-muted text-muted-foreground",
};

const ACTION_ICONS: Partial<Record<string, LucideIcon>> = {
  ITEM_PRICE_CHANGED: IndianRupee,
  STOCK_ADJUSTED: Package,
  USER_PASSWORD_RESET: KeyRound,
  LOGIN_FAILED: ShieldAlert,
  LOGIN_LOCKED: ShieldAlert,
};

// The same icons the sidebar uses for each part of the app.
const ENTITY_ICONS: Record<string, LucideIcon> = {
  item: UtensilsCrossed,
  category: LayoutGrid,
  user: Users,
  expense: BookOpenText,
  expense_category: BookOpenText,
  shop_settings: Store,
  bill: ReceiptText,
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function Sentence({ text }: { text: AuditText }) {
  return text.map((part, index) =>
    typeof part === "string" ? (
      part
    ) : (
      <strong key={index} className="font-semibold text-foreground">
        {part.strong}
      </strong>
    ),
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className={SECTION_LABEL}>{label}</p>
      <pre className="max-h-56 overflow-auto rounded-xl border bg-table-head p-3 font-mono text-xs leading-relaxed">
        {value === null || value === undefined
          ? "—"
          : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** Who did it: a person, the menu import, or the system itself. */
function Actor({
  entry,
  imported,
}: {
  entry: AuditLogEntry;
  imported: boolean;
}) {
  if (imported || !entry.actorName) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted">
          <Sparkles className="size-3.5" />
        </span>
        <span className="font-medium text-foreground">
          {imported ? "Menu card import" : "System"}
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground/80">
        {initials(entry.actorName)}
      </span>
      <span className="font-medium text-foreground">{entry.actorName}</span>
    </span>
  );
}

/**
 * One audit row, in plain words: what happened, only what changed, and every
 * value as the owner would say it. The raw snapshots stay under "Technical
 * details" for troubleshooting.
 */
export function AuditDiffDialog({
  entry,
  refs,
  onOpenChange,
}: {
  entry: AuditLogEntry | null;
  refs: AuditRefs;
  onOpenChange: (open: boolean) => void;
}) {
  const details = entry ? describeAuditEntry(entry, refs) : null;
  const Icon = entry
    ? (ACTION_ICONS[entry.action] ?? ENTITY_ICONS[entry.entityType] ?? History)
    : History;
  // A failed sign-in is recorded against the account, not by a person.
  const isSignIn = entry?.action.startsWith("LOGIN_") ?? false;
  const imported = details?.imported ?? false;

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {entry && details ? (
          <>
            <DialogHeader className="flex-row items-start gap-3.5 text-left">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  TONES[details.tone],
                )}
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 space-y-1 pr-6">
                <DialogTitle>
                  {AUDIT_ACTION_LABELS[entry.action as AuditAction] ??
                    entry.action}
                </DialogTitle>
                <DialogDescription className="text-[15px] leading-relaxed text-foreground/80">
                  <Sentence text={details.summary} />
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
              {isSignIn ? null : <Actor entry={entry} imported={imported} />}
              <span className="flex items-center gap-1.5 tabular-nums">
                <Clock className="size-3.5" />
                {WHEN.format(entry.createdAt)}
              </span>
              {details.subject ? (
                <span className="max-w-full truncate rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground/75">
                  {details.subject}
                </span>
              ) : null}
            </div>

            {details.changes.length > 0 ? (
              <section className="space-y-2">
                <h3 className={SECTION_LABEL}>What changed</h3>
                <ul className="divide-y rounded-2xl border">
                  {details.changes.map((change) => (
                    <li key={change.key} className={ROW}>
                      <span className="text-sm text-muted-foreground">
                        {change.label}
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
                        <span className="wrap-break-word text-muted-foreground line-through decoration-muted-foreground/40">
                          <span className="sr-only">Was </span>
                          {change.before}
                        </span>
                        <ArrowRight
                          aria-hidden
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                        <span className="font-semibold wrap-break-word">
                          <span className="sr-only">, now </span>
                          {change.after}
                        </span>
                        {change.delta ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              change.delta.direction === "up"
                                ? "bg-success-soft text-success-ink"
                                : "bg-destructive-soft text-destructive-ink",
                            )}
                          >
                            {change.delta.text}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {details.facts.length > 0 ? (
              <section className="space-y-2">
                <h3 className={SECTION_LABEL}>{details.factsTitle}</h3>
                <dl className="divide-y rounded-2xl border">
                  {details.facts.map((fact) => (
                    <div key={fact.key} className={ROW}>
                      <dt className="text-sm text-muted-foreground">
                        {fact.label}
                      </dt>
                      <dd className="text-sm font-medium wrap-break-word tabular-nums">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {details.notes.map((note) => (
              <p
                key={note}
                className="flex gap-2 rounded-xl bg-muted/70 px-3.5 py-2.5 text-[13px] text-foreground/75"
              >
                <Info className="mt-0.5 size-4 shrink-0" />
                {note}
              </p>
            ))}

            <details className="group rounded-2xl border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                Technical details
              </summary>
              <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
                <Snapshot label="Before" value={entry.before} />
                <Snapshot label="After" value={entry.after} />
              </div>
            </details>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
