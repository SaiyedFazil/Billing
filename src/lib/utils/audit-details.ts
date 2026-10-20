import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";
import { EXPENSE_MODE_LABELS } from "@/constants/expense-modes";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { ROLE_LABELS } from "@/constants/roles";
import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/constants/sign-in";
import { compare, formatINR, subtract, toAmount } from "@/lib/utils/money";
import { PRINTER_WIDTH_LABELS } from "@/lib/validation/settings-schema";
import type {
  AuditChange,
  AuditDetails,
  AuditFact,
  AuditLogEntry,
  AuditRefs,
  AuditText,
  AuditTone,
} from "@/types/audit.types";

/**
 * Turns an audit row's raw before/after snapshots into something the owner
 * can read: a sentence saying what happened, only the fields that changed,
 * and every value in plain words — names instead of ids, ₹ amounts, labels
 * instead of codes.
 *
 * Pure, and tolerant of anything: rows written by older code, or by code not
 * yet known here, still render through the generic fallbacks rather than
 * throwing. verify:audit-details covers every action.
 */

type Payload = Record<string, unknown>;

type Field = {
  label: string;
  format?: (value: unknown, refs: AuditRefs) => string;
  /** Show the difference next to a change. */
  delta?: "money" | "count";
  /** An on/off setting: its summary reads "turned off …". */
  toggle?: boolean;
  /** Shown when the value changed but reads the same, e.g. a new photo. */
  replaced?: [before: string, after: string];
};

const EMPTY = "—";

/** Bookkeeping a person never needs: storage ids, and the import marker. */
const HIDDEN = new Set(["imageFileId", "source"]);

// ---------------------------------------------------------------- values

function asRecord(value: unknown): Payload | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Payload)
    : null;
}

function plain(value: unknown): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(plain).join(", ") : EMPTY;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isAmount(value: unknown): value is string | number {
  return (
    (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function rupees(value: unknown): string {
  return isAmount(value) ? formatINR(toAmount(value)) : plain(value);
}

/** "2026-10-20" → "20 Oct 2026". Read at UTC so no timezone can shift it. */
function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return plain(value);
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const onOff = (value: unknown) => (value ? "On" : "Off");

function labelled(labels: Record<string, string>) {
  return (value: unknown) =>
    typeof value === "string" && value in labels ? labels[value] : plain(value);
}

/** An id, shown as the current name of what it points at. */
function reference(missing: string) {
  return (value: unknown, refs: AuditRefs) =>
    typeof value === "string" ? (refs[value] ?? missing) : plain(value);
}

/** "lowStockThreshold" → "Low stock threshold", for fields not listed below. */
function humanize(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

// ---------------------------------------------------------------- fields

// Same wording as the Update stock dialog.
const STOCK_MODE_LABELS = {
  ADD: "Add stock",
  REMOVE: "Remove stock",
  SET: "Set count",
};
const STOCK_REASON_LABELS = {
  RESTOCK: "Restock",
  WASTAGE: "Damaged or expired",
  CORRECTION: "Count correction",
};

/**
 * Every field each kind of row records, in the order they read best. The
 * labels match the forms the owner fills in, so a field reads the same here
 * as where it was changed.
 */
const FIELDS: Record<string, Record<string, Field>> = {
  item: {
    name: { label: "Name" },
    categoryId: { label: "Category", format: reference("Unknown category") },
    price: { label: "Price", format: rupees, delta: "money" },
    isAvailable: {
      label: "Availability",
      format: (value) => (value ? "Available" : "Sold out"),
    },
    imageUrl: {
      label: "Photo",
      format: (value) => (value ? "Has a photo" : "No photo"),
      replaced: ["Old photo", "New photo"],
    },
    sortOrder: { label: "Display order" },
    trackStock: { label: "Track stock", format: onOff, toggle: true },
    openingStock: { label: "Opening stock" },
    lowStockThreshold: {
      label: "Low-stock alert at",
      format: (value) => (value === 0 ? "Never" : plain(value)),
    },
    stockQuantity: { label: "In stock", delta: "count" },
    mode: { label: "How", format: labelled(STOCK_MODE_LABELS) },
    reason: { label: "Reason", format: labelled(STOCK_REASON_LABELS) },
    note: { label: "Note" },
  },
  category: {
    name: { label: "Name" },
    sortOrder: { label: "Display order" },
  },
  shop_settings: {
    shopName: { label: "Shop name" },
    addressLine: { label: "Address" },
    phone: { label: "Phone" },
    receiptFooter: { label: "Receipt footer" },
    receiptShowLogo: { label: "Logo on receipt", format: onOff, toggle: true },
    printerWidth: {
      label: "Printer width",
      format: labelled(PRINTER_WIDTH_LABELS),
    },
    timezone: { label: "Timezone" },
    paymentMethods: {
      label: "Payment methods",
      format: (value) =>
        Array.isArray(value)
          ? plain(value.map(labelled(PAYMENT_METHOD_LABELS)))
          : plain(value),
    },
  },
  expense: {
    expenseDate: { label: "Date", format: calendarDate },
    amount: { label: "Amount", format: rupees, delta: "money" },
    categoryId: { label: "Category", format: reference("Unknown category") },
    categoryName: { label: "Category" },
    mode: { label: "Paid by", format: labelled(EXPENSE_MODE_LABELS) },
    paidTo: { label: "Paid to" },
    note: { label: "Note" },
    reason: { label: "Reason for cancelling" },
  },
  expense_category: {
    name: { label: "Name" },
  },
  user: {
    name: { label: "Name" },
    username: { label: "Username" },
    role: { label: "Role", format: labelled(ROLE_LABELS) },
    isActive: {
      label: "Status",
      format: (value) => (value ? "Active" : "Deactivated"),
    },
    failedAttempts: { label: "Wrong passwords in a row" },
    locked: { label: "Account locked" },
  },
  bill: {
    billNumber: { label: "Bill", format: (value) => `#${plain(value)}` },
    businessDate: { label: "Business day", format: calendarDate },
  },
};

function fieldFor(entityType: string, key: string): Field {
  return FIELDS[entityType]?.[key] ?? { label: humanize(key) };
}

function show(field: Field, value: unknown, refs: AuditRefs): string {
  return field.format ? field.format(value, refs) : plain(value);
}

/** Listed fields first, in their listed order; anything else after. */
function ordered(entityType: string, keys: string[]): string[] {
  const order = Object.keys(FIELDS[entityType] ?? {});
  const rank = (key: string) =>
    order.includes(key) ? order.indexOf(key) : order.length;
  return keys
    .filter((key) => !HIDDEN.has(key))
    .sort((a, b) => rank(a) - rank(b));
}

// ------------------------------------------------------- changes and facts

function sameValue(field: Field, a: unknown, b: unknown): boolean {
  if (field.delta === "money" && isAmount(a) && isAmount(b)) {
    return compare(toAmount(a), toAmount(b)) === 0;
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function deltaOf(
  field: Field,
  before: unknown,
  after: unknown,
): AuditChange["delta"] {
  if (field.delta === "money" && isAmount(before) && isAmount(after)) {
    const difference = subtract(toAmount(after), toAmount(before));
    const sign = compare(difference, "0");
    if (sign === 0) return null;
    // A true minus sign, as the stock history uses.
    return sign > 0
      ? { text: `+${formatINR(difference)}`, direction: "up" }
      : { text: `−${formatINR(subtract("0", difference))}`, direction: "down" };
  }
  if (
    field.delta === "count" &&
    typeof before === "number" &&
    typeof after === "number" &&
    before !== after
  ) {
    const difference = after - before;
    return difference > 0
      ? { text: `+${difference}`, direction: "up" }
      : { text: `−${Math.abs(difference)}`, direction: "down" };
  }
  return null;
}

/** Fields recorded on both sides whose value differs. */
function changesBetween(
  entityType: string,
  before: Payload | null,
  after: Payload | null,
  refs: AuditRefs,
): AuditChange[] {
  if (!before || !after) return [];
  const shared = Object.keys(after).filter((key) => key in before);

  return ordered(entityType, shared).flatMap((key): AuditChange[] => {
    const field = fieldFor(entityType, key);
    if (sameValue(field, before[key], after[key])) return [];

    let was = show(field, before[key], refs);
    let now = show(field, after[key], refs);
    if (was === now && field.replaced) [was, now] = field.replaced;

    return [
      {
        key,
        label: field.label,
        before: was,
        after: now,
        delta: deltaOf(field, before[key], after[key]),
      },
    ];
  });
}

/** One row per recorded value, leaving out empty ones. */
function factsFrom(
  entityType: string,
  payload: Payload | null,
  refs: AuditRefs,
  skip: (key: string) => boolean = () => false,
): AuditFact[] {
  if (!payload) return [];
  return ordered(entityType, Object.keys(payload))
    .filter((key) => !skip(key) && plain(payload[key]) !== EMPTY)
    .map((key) => {
      const field = fieldFor(entityType, key);
      return {
        key,
        label: field.label,
        value: show(field, payload[key], refs),
      };
    });
}

// ----------------------------------------------------------------- actions

type Kind = "create" | "update" | "remove" | "event";

const ACTIONS: Record<AuditAction, { kind: Kind; tone: AuditTone }> = {
  ITEM_CREATED: { kind: "create", tone: "created" },
  ITEM_UPDATED: { kind: "update", tone: "updated" },
  ITEM_PRICE_CHANGED: { kind: "update", tone: "updated" },
  ITEM_DELETED: { kind: "remove", tone: "removed" },
  STOCK_ADJUSTED: { kind: "update", tone: "updated" },
  EXPENSE_CREATED: { kind: "create", tone: "created" },
  EXPENSE_UPDATED: { kind: "update", tone: "updated" },
  EXPENSE_CANCELLED: { kind: "remove", tone: "removed" },
  EXPENSE_CATEGORY_CREATED: { kind: "create", tone: "created" },
  EXPENSE_CATEGORY_UPDATED: { kind: "update", tone: "updated" },
  EXPENSE_CATEGORY_RETIRED: { kind: "remove", tone: "removed" },
  CATEGORY_CREATED: { kind: "create", tone: "created" },
  CATEGORY_UPDATED: { kind: "update", tone: "updated" },
  CATEGORY_DELETED: { kind: "remove", tone: "removed" },
  USER_CREATED: { kind: "create", tone: "created" },
  USER_UPDATED: { kind: "update", tone: "updated" },
  USER_DEACTIVATED: { kind: "update", tone: "removed" },
  USER_PASSWORD_RESET: { kind: "event", tone: "security" },
  SETTINGS_UPDATED: { kind: "update", tone: "updated" },
  BILL_REPRINTED: { kind: "event", tone: "event" },
  BILL_VOIDED: { kind: "event", tone: "removed" },
  LOGIN_FAILED: { kind: "event", tone: "security" },
  LOGIN_LOCKED: { kind: "event", tone: "security" },
};

const ENTITY_LABELS: Record<string, string> = {
  item: "Item",
  category: "Category",
  user: "Account",
  expense: "Expense",
  expense_category: "Expense category",
  shop_settings: "Shop settings",
  bill: "Bill",
};

/** Rows the menu card import wrote carry `source: "menu-card-YYYY-MM-DD"`. */
function importDate(before: Payload | null, after: Payload | null) {
  const source = after?.source ?? before?.source;
  const match =
    typeof source === "string"
      ? /^menu-card-(\d{4}-\d{2}-\d{2})$/.exec(source)
      : null;
  return match ? calendarDate(match[1]) : null;
}

/**
 * What the row is about. The name recorded at the time comes first — a
 * removed item should read as it was — then the current name from refs.
 */
function nameOf(
  entry: AuditLogEntry,
  refs: AuditRefs,
  before: Payload | null,
  after: Payload | null,
): string | null {
  const recorded = after?.name ?? before?.name;
  if (typeof recorded === "string" && recorded) return recorded;
  if (entry.entityType === "bill") {
    const number = after?.billNumber ?? before?.billNumber;
    if (number !== undefined && number !== null) {
      return `Bill #${plain(number)}`;
    }
  }
  return entry.entityId ? (refs[entry.entityId] ?? null) : null;
}

const strong = (text: string) => ({ strong: text });

const counted = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const withArticle = (noun: string) =>
  `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

type Context = {
  entry: AuditLogEntry;
  actor: string;
  name: string | null;
  /** The thing's name in bold, or a plain fallback like "an item". */
  subject: (fallback: string) => AuditText[number];
  before: Payload | null;
  after: Payload | null;
  changes: AuditChange[];
  refs: AuditRefs;
};

/** "renamed X to Y" when the name changed, otherwise "updated X". */
function renamedOrUpdated(context: Context, noun: string): AuditText {
  const { actor, changes, subject } = context;
  const rename = changes.find((change) => change.key === "name");
  return rename
    ? [
        actor,
        ` renamed the ${noun} `,
        strong(rename.before),
        " to ",
        strong(rename.after),
        ".",
      ]
    : [actor, ` updated the ${noun} `, subject(`a ${noun}`), "."];
}

function settingsSummary({ entry, actor, changes }: Context): AuditText {
  if (changes.length === 0) {
    return [actor, " saved the shop settings without changing anything."];
  }
  if (changes.length > 1) {
    return [
      actor,
      " changed ",
      strong(counted(changes.length, "setting")),
      ".",
    ];
  }
  const [change] = changes;
  const label = change.label.toLowerCase();
  if (fieldFor(entry.entityType, change.key).toggle) {
    return [
      actor,
      " turned ",
      strong(change.after.toLowerCase()),
      ` “${change.label}”.`,
    ];
  }
  if (change.before === EMPTY) {
    return [actor, ` set the ${label} to `, strong(change.after), "."];
  }
  if (change.after === EMPTY) return [actor, ` cleared the ${label}.`];
  return [
    actor,
    ` changed the ${label} from `,
    change.before,
    " to ",
    strong(change.after),
    ".",
  ];
}

function summarize(action: string, context: Context): AuditText {
  const { actor, name, subject, before, after, changes, refs } = context;

  switch (action) {
    case "ITEM_CREATED": {
      const category =
        typeof after?.categoryId === "string" ? refs[after.categoryId] : null;
      return [
        actor,
        " added ",
        subject("an item"),
        ...(category ? [" to ", strong(category)] : []),
        ...(isAmount(after?.price) ? [" at ", rupees(after?.price)] : []),
        ".",
      ];
    }
    case "ITEM_UPDATED": {
      if (changes.length === 1 && changes[0].key === "isAvailable") {
        return [
          actor,
          " marked ",
          subject("an item"),
          after?.isAvailable ? " as available again." : " as sold out.",
        ];
      }
      if (changes.length === 0) {
        return [
          actor,
          " saved ",
          subject("an item"),
          " without changing anything.",
        ];
      }
      return [
        actor,
        " updated ",
        subject("an item"),
        ` (${counted(changes.length, "change")}).`,
      ];
    }
    case "ITEM_PRICE_CHANGED":
      return [
        actor,
        " changed the price of ",
        subject("an item"),
        ...(isAmount(before?.price) && isAmount(after?.price)
          ? [
              " from ",
              rupees(before?.price),
              " to ",
              strong(rupees(after?.price)),
            ]
          : []),
        ".",
      ];
    case "ITEM_DELETED":
      return [actor, " removed ", subject("an item"), " from the menu."];
    case "STOCK_ADJUSTED": {
      const verbs: Record<string, string> = {
        RESTOCK: "restocked",
        WASTAGE: "wrote off stock of",
        CORRECTION: "corrected the stock count of",
      };
      const verb =
        (typeof after?.reason === "string" && verbs[after.reason]) ||
        "adjusted the stock of";
      const was = before?.stockQuantity;
      const now = after?.stockQuantity;
      return [
        actor,
        ` ${verb} `,
        subject("an item"),
        ...(typeof was === "number" && typeof now === "number"
          ? [", from ", String(was), " to ", strong(String(now))]
          : []),
        ".",
      ];
    }
    case "CATEGORY_CREATED":
      return [actor, " added the category ", subject("a category"), "."];
    case "CATEGORY_UPDATED":
      return renamedOrUpdated(context, "category");
    case "CATEGORY_DELETED":
      return [actor, " removed the category ", subject("a category"), "."];
    case "EXPENSE_CREATED":
      return [
        actor,
        " added an expense",
        ...(isAmount(after?.amount)
          ? [" of ", strong(rupees(after?.amount))]
          : []),
        ...(typeof after?.categoryName === "string"
          ? [" for ", strong(after.categoryName)]
          : []),
        ...(typeof after?.paidTo === "string" && after.paidTo
          ? [", paid to ", strong(after.paidTo)]
          : []),
        ".",
      ];
    case "EXPENSE_UPDATED":
      return [
        actor,
        " edited the expense ",
        subject("entry"),
        ` (${counted(changes.length, "change")}).`,
      ];
    case "EXPENSE_CANCELLED":
      return [actor, " cancelled the expense ", subject("entry"), "."];
    case "EXPENSE_CATEGORY_CREATED":
      return [
        actor,
        " added the expense category ",
        subject("a category"),
        ".",
      ];
    case "EXPENSE_CATEGORY_UPDATED":
      return renamedOrUpdated(context, "expense category");
    case "EXPENSE_CATEGORY_RETIRED":
      return [
        actor,
        " retired the expense category ",
        subject("a category"),
        ".",
      ];
    case "USER_CREATED": {
      const role = labelled(ROLE_LABELS)(after?.role);
      return [
        actor,
        " added ",
        subject("an account"),
        role === EMPTY ? "." : ` as ${withArticle(role)}.`,
      ];
    }
    case "USER_UPDATED":
      return after?.isActive === true && before?.isActive === false
        ? [actor, " reactivated ", subject("an account"), "."]
        : [actor, " updated ", subject("an account"), "."];
    case "USER_DEACTIVATED":
      return [actor, " deactivated ", subject("an account"), "."];
    case "USER_PASSWORD_RESET":
      return [
        actor,
        " reset the password for ",
        !name && typeof after?.username === "string"
          ? strong(after.username)
          : subject("an account"),
        ".",
      ];
    case "SETTINGS_UPDATED":
      return settingsSummary(context);
    case "BILL_REPRINTED":
      return [
        actor,
        " reprinted ",
        subject("a bill"),
        ...(after?.businessDate
          ? [" of ", calendarDate(after.businessDate)]
          : []),
        ".",
      ];
    case "BILL_VOIDED":
      return [actor, " voided ", subject("a bill"), "."];
    case "LOGIN_FAILED":
      return [
        "Someone entered the wrong password for ",
        subject("an account"),
        ".",
      ];
    case "LOGIN_LOCKED": {
      const reason = ` locked after ${MAX_FAILED_ATTEMPTS} wrong passwords in a row.`;
      return name
        ? [strong(name), `’s account was${reason}`]
        : [`An account was${reason}`];
    }
    default:
      return [
        actor,
        " — ",
        AUDIT_ACTION_LABELS[action as AuditAction] ?? action,
        ".",
      ];
  }
}

function notesFor(action: string, kind: Kind, importedOn: string | null) {
  const notes: string[] = [];
  if (importedOn) {
    notes.push(
      kind === "create"
        ? `Added automatically by the menu card import of ${importedOn}.`
        : kind === "remove"
          ? `Removed automatically when the menu card of ${importedOn} replaced the menu.`
          : `Changed automatically by the menu card import of ${importedOn}.`,
    );
  }
  switch (action) {
    case "ITEM_PRICE_CHANGED":
      notes.push("Bills already issued keep the price they were sold at.");
      break;
    case "ITEM_DELETED":
    case "CATEGORY_DELETED":
      notes.push(
        "Taken off the menu, not deleted: past bills and reports still show it.",
      );
      break;
    case "USER_DEACTIVATED":
      notes.push("They can no longer sign in. Their past bills are kept.");
      break;
    case "USER_PASSWORD_RESET":
      notes.push("The new password itself is never recorded.");
      break;
    case "LOGIN_FAILED":
      notes.push(
        `The account locks after ${MAX_FAILED_ATTEMPTS} wrong passwords in a row.`,
      );
      break;
    case "LOGIN_LOCKED":
      notes.push(`It unlocks by itself after ${LOCKOUT_MINUTES} minutes.`);
      break;
  }
  return notes;
}

export function describeAuditEntry(
  entry: AuditLogEntry,
  refs: AuditRefs,
): AuditDetails {
  const config = ACTIONS[entry.action as AuditAction] ?? {
    kind: "event",
    tone: "event",
  };
  const type = entry.entityType;
  const before = asRecord(entry.before);
  const after = asRecord(entry.after);
  const importedOn = importDate(before, after);

  // A sign-in failure is recorded against the account it was for.
  const name =
    nameOf(entry, refs, before, after) ??
    (entry.action.startsWith("LOGIN_") ? entry.actorName : null);

  const changes =
    config.kind === "update" ? changesBetween(type, before, after, refs) : [];

  let facts: AuditFact[];
  let factsTitle = "Details";
  if (config.kind === "update") {
    // Values only the after side records, like a stock adjustment's reason.
    facts = factsFrom(
      type,
      after,
      refs,
      (key) => before !== null && key in before,
    );
  } else if (config.kind === "remove") {
    const removed = factsFrom(type, before, refs);
    if (removed.length > 0) factsTitle = "What was removed";
    facts = [...removed, ...factsFrom(type, after, refs)];
  } else {
    facts = factsFrom(type, after, refs);
  }

  const context: Context = {
    entry,
    actor: importedOn
      ? "The menu card import"
      : (entry.actorName ?? "The system"),
    name,
    subject: (fallback) => (name ? strong(name) : fallback),
    before,
    after,
    changes,
    refs,
  };

  const entityLabel = ENTITY_LABELS[type] ?? humanize(type);

  return {
    tone: config.tone,
    summary: summarize(entry.action, context),
    // A bill's name is already "Bill #47".
    subject:
      type === "shop_settings" || !name
        ? entityLabel
        : type === "bill"
          ? name
          : `${entityLabel} · ${name}`,
    changes,
    facts,
    factsTitle,
    notes: notesFor(entry.action, config.kind, importedOn),
    imported: importedOn !== null,
  };
}
