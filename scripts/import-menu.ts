import { and, eq } from "drizzle-orm";

import type { AuditAction } from "../src/constants/audit-actions";
import { db } from "../src/db";
import {
  auditLog,
  categories,
  items,
  type NewAuditLogRow,
} from "../src/db/schema";
import { toAmount } from "../src/lib/utils/money";
import {
  MENU_CARD,
  MENU_CARD_SOURCE,
} from "./menu-import/menu-card-2026-08-11";
import {
  type CategoryPlan,
  type CurrentMenu,
  planImport,
  validateCard,
} from "./menu-import/plan";

/**
 * Adds the shop's menu card to the database: every category and item on it
 * that is not already on the menu.
 *
 *   npm run db:import-menu -- --dry-run   # print the plan, write nothing
 *   npm run db:import-menu                # import
 *
 * Additive only. It never renames, re-prices, reorders or retires anything
 * already there, so existing items bill exactly as before, and a second run
 * adds nothing. What counts as a duplicate is set out in menu-import/plan.ts.
 *
 * Everything is written in one transaction, so a failure leaves nothing
 * half-imported. A dry run makes those same inserts and then rolls them back,
 * which proves the real run will also pass every database constraint.
 */

type AuditRow = NewAuditLogRow & { action: AuditAction };

/** Thrown at the end of a dry run to roll its transaction back. */
class DryRunRollback extends Error {}

function parseArgs(argv: string[]): { dryRun: boolean } {
  const unknown = argv.filter((arg) => arg !== "--dry-run");
  // A typo such as --dryrun must never fall through to a real import.
  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument: ${unknown.join(" ")}. The only option is --dry-run.`,
    );
  }
  return { dryRun: argv.includes("--dry-run") };
}

async function readCurrentMenu(): Promise<CurrentMenu> {
  const activeCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.isActive, true));

  const activeItems = await db
    .select({
      name: items.name,
      price: items.price,
      categoryId: items.categoryId,
      categoryName: categories.name,
      sortOrder: items.sortOrder,
    })
    .from(items)
    .innerJoin(categories, eq(categories.id, items.categoryId))
    .where(and(eq(items.isActive, true), eq(categories.isActive, true)));

  return { categories: activeCategories, items: activeItems };
}

/**
 * Writes the plan in a single transaction. Only throws inside it — returning
 * from the callback commits. See CLAUDE.md rule 6.
 */
async function applyPlan(plan: CategoryPlan[], dryRun: boolean) {
  try {
    await db.transaction(async (tx) => {
      const audit: AuditRow[] = [];

      for (const group of plan) {
        let categoryId: string;

        if (group.category.status === "existing") {
          categoryId = group.category.id;
        } else if (group.category.status === "new") {
          const values = {
            name: group.name,
            sortOrder: group.category.sortOrder,
          };
          const [created] = await tx
            .insert(categories)
            .values(values)
            .returning({ id: categories.id });
          categoryId = created.id;
          audit.push({
            action: "CATEGORY_CREATED",
            entityType: "category",
            entityId: created.id,
            after: { ...values, source: MENU_CARD_SOURCE },
          });
        } else {
          continue;
        }

        const toAdd = group.items.flatMap((item) =>
          item.action === "add"
            ? [
                {
                  categoryId,
                  name: item.name,
                  price: item.price,
                  sortOrder: item.sortOrder,
                },
              ]
            : [],
        );
        if (toAdd.length === 0) continue;

        // Untracked, like any item created without stock: it bills exactly as
        // items did before stock existed, so no stock_movements row is due.
        const created = await tx.insert(items).values(toAdd).returning({
          id: items.id,
          name: items.name,
          price: items.price,
          sortOrder: items.sortOrder,
        });
        for (const row of created) {
          audit.push({
            action: "ITEM_CREATED",
            entityType: "item",
            entityId: row.id,
            after: {
              name: row.name,
              categoryId,
              price: row.price,
              sortOrder: row.sortOrder,
              source: MENU_CARD_SOURCE,
            },
          });
        }
      }

      // One statement, inside the transaction: an import that committed with
      // only part of its history logged would be harder to trust than none.
      // actorId stays null, which the audit screen shows as "System".
      if (audit.length > 0) {
        await tx.insert(auditLog).values(audit);
      }

      if (dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
}

function printPlan(plan: CategoryPlan[]) {
  const nameWidth = Math.max(
    ...plan.flatMap((group) => group.items.map((item) => item.name.length)),
  );

  console.log(
    "\n  + to add   = already on the menu" +
      "   ! already on the menu, but not as the card has it (left unchanged)",
  );

  for (const group of plan) {
    const status = {
      existing: "existing category",
      new: "new category",
      unneeded: "not created: all its items are already on the menu",
    }[group.category.status];
    console.log(`\n${group.name}  (${status})`);

    for (const item of group.items) {
      const line = `${item.name.padEnd(nameWidth)}  ${item.price.padStart(7)}`;
      if (item.action === "add") {
        console.log(`  + ${line}`);
      } else if (!item.differs) {
        console.log(`  = ${line}`);
      } else {
        const { existing } = item;
        console.log(
          `  ! ${line}  is "${existing.name}" in ${existing.categoryName} ` +
            `at ${toAmount(existing.price)}`,
        );
      }
    }
  }
}

/** Host and database name only — never the credentials in the URL. */
function describeTarget(): string {
  try {
    const { hostname, pathname } = new URL(process.env.DATABASE_URL ?? "");
    return `${hostname}${pathname}`;
  } catch {
    return "(DATABASE_URL is not set)";
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const card = validateCard(MENU_CARD);

  console.log(`Database:  ${describeTarget()}`);
  console.log(
    `Menu card: ${MENU_CARD_SOURCE} — ${card.length} categories, ` +
      `${card.reduce((sum, group) => sum + group.items.length, 0)} items`,
  );

  const plan = planImport(card, await readCurrentMenu());
  printPlan(plan);

  const newCategories = plan.filter(
    (group) => group.category.status === "new",
  ).length;
  const planned = plan.flatMap((group) => group.items);
  const newItems = planned.filter((item) => item.action === "add").length;
  const differing = planned.filter(
    (item) => item.action === "skip" && item.differs,
  ).length;

  console.log(
    `\nCategories to create: ${newCategories}` +
      `\nItems to add:         ${newItems}` +
      `\nAlready on the menu:  ${planned.length - newItems}` +
      (differing > 0
        ? ` (${differing} not as the card has it; review in Administration > Items)`
        : ""),
  );

  if (newItems === 0) {
    console.log("\nNothing to import: every item on the card is on the menu.");
    process.exit(0);
  }

  await applyPlan(plan, dryRun);

  console.log(
    dryRun
      ? "\nDry run: every insert succeeded and was rolled back. Nothing was " +
          "written. Run without --dry-run to import."
      : `\nImported ${newCategories} categories and ${newItems} items.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("\nImport FAILED. Nothing was written.\n", error);
  process.exit(1);
});
