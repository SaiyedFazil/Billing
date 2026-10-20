import { asc, eq, inArray } from "drizzle-orm";

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
  type CurrentMenu,
  type MenuPlan,
  planImport,
  validateCard,
} from "./menu-import/plan";

/**
 * Loads the shop's menu card into the database.
 *
 *   npm run db:import-menu -- --dry-run             # preview adding it
 *   npm run db:import-menu                          # add what is missing
 *   npm run db:import-menu -- --replace --dry-run   # preview replacing
 *   npm run db:import-menu -- --replace             # the card becomes the menu
 *
 * Without --replace it only adds: nothing already on the menu is touched. With
 * --replace every current item and category is retired and the card created
 * fresh, keeping only what is already exactly the card's. Either way a second
 * run changes nothing. The rules are in menu-import/plan.ts.
 *
 * Everything is written in one transaction, so the till never sees half a
 * menu and a failure leaves nothing changed. A dry run makes the same writes
 * and then rolls them back, which proves the real run will also pass every
 * database constraint. Every change is audited, as the admin screens do.
 */

type AuditRow = NewAuditLogRow & { action: AuditAction };

/** Thrown at the end of a dry run to roll its transaction back. */
class DryRunRollback extends Error {}

const OPTIONS = ["--dry-run", "--replace"];

function parseArgs(argv: string[]): { dryRun: boolean; replace: boolean } {
  const unknown = argv.filter((arg) => !OPTIONS.includes(arg));
  // A typo such as --dryrun must never fall through to a real run.
  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument: ${unknown.join(" ")}. ` +
        `The options are ${OPTIONS.join(" and ")}.`,
    );
  }
  return {
    dryRun: argv.includes("--dry-run"),
    replace: argv.includes("--replace"),
  };
}

async function readCurrentMenu(): Promise<CurrentMenu> {
  const activeCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  // Every active item, including any left in a retired category, so that
  // replacing the menu leaves nothing behind.
  const activeItems = await db
    .select({
      id: items.id,
      name: items.name,
      price: items.price,
      categoryId: items.categoryId,
      categoryName: categories.name,
      sortOrder: items.sortOrder,
    })
    .from(items)
    .innerJoin(categories, eq(categories.id, items.categoryId))
    .where(eq(items.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(items.sortOrder));

  return { categories: activeCategories, items: activeItems };
}

/**
 * Writes the plan in a single transaction. Only throws inside it — returning
 * from the callback commits. See CLAUDE.md rule 6.
 */
async function applyPlan(plan: MenuPlan, dryRun: boolean) {
  const source = MENU_CARD_SOURCE;

  try {
    await db.transaction(async (tx) => {
      const audit: AuditRow[] = [];
      const now = new Date();

      // Retire first, so the fresh "Burgers" can take the name the old one is
      // giving up; the live-name unique indexes would refuse it otherwise.
      // Soft delete only, as the admin does: past bills point at these rows.
      const { items: oldItems, categories: oldCategories } = plan.retire;
      if (oldItems.length > 0) {
        await tx
          .update(items)
          .set({ isActive: false, updatedAt: now })
          .where(
            inArray(
              items.id,
              oldItems.map((item) => item.id),
            ),
          );
        for (const item of oldItems) {
          audit.push({
            action: "ITEM_DELETED",
            entityType: "item",
            entityId: item.id,
            before: { name: item.name, price: item.price },
            after: { source },
          });
        }
      }
      if (oldCategories.length > 0) {
        await tx
          .update(categories)
          .set({ isActive: false, updatedAt: now })
          .where(
            inArray(
              categories.id,
              oldCategories.map((category) => category.id),
            ),
          );
        for (const category of oldCategories) {
          audit.push({
            action: "CATEGORY_DELETED",
            entityType: "category",
            entityId: category.id,
            before: { name: category.name, sortOrder: category.sortOrder },
            after: { source },
          });
        }
      }

      for (const group of plan.categories) {
        const { category } = group;
        let categoryId: string;

        if (category.status === "existing") {
          categoryId = category.id;
        } else if (category.status === "keep") {
          categoryId = category.existing.id;
          if (category.existing.sortOrder !== category.sortOrder) {
            await tx
              .update(categories)
              .set({ sortOrder: category.sortOrder, updatedAt: now })
              .where(eq(categories.id, categoryId));
            audit.push({
              action: "CATEGORY_UPDATED",
              entityType: "category",
              entityId: categoryId,
              before: { sortOrder: category.existing.sortOrder },
              after: { sortOrder: category.sortOrder, source },
            });
          }
        } else if (category.status === "new") {
          const values = { name: group.name, sortOrder: category.sortOrder };
          const [created] = await tx
            .insert(categories)
            .values(values)
            .returning({ id: categories.id });
          categoryId = created.id;
          audit.push({
            action: "CATEGORY_CREATED",
            entityType: "category",
            entityId: created.id,
            after: { ...values, source },
          });
        } else {
          continue;
        }

        // A kept item only ever moves into its place on the card. Like
        // renumberCategory, that is not an edit to the item, so it is neither
        // audited nor timestamped.
        for (const item of group.items) {
          if (
            item.action === "keep" &&
            item.existing.sortOrder !== item.sortOrder
          ) {
            await tx
              .update(items)
              .set({ sortOrder: item.sortOrder })
              .where(eq(items.id, item.existing.id));
          }
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
              source,
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

function printPlan(plan: MenuPlan, replace: boolean) {
  const nameWidth = Math.max(
    ...plan.categories.flatMap((group) =>
      group.items.map((item) => item.name.length),
    ),
    ...plan.retire.items.map((item) => item.name.length),
  );
  const line = (name: string, price: string) =>
    `${name.padEnd(nameWidth)}  ${toAmount(price).padStart(7)}`;

  console.log(
    replace
      ? "\n  - to retire   + to add   = already exactly the card's (kept)"
      : "\n  + to add   = already on the menu" +
          "   ! already on the menu, but not as the card has it (left unchanged)",
  );

  const { items: oldItems, categories: oldCategories } = plan.retire;
  if (oldItems.length > 0 || oldCategories.length > 0) {
    console.log("\n=== Current menu to retire (switched off, not deleted) ===");
    for (const category of oldCategories) {
      console.log(`\n${category.name}`);
      for (const item of oldItems) {
        if (item.categoryId === category.id) {
          console.log(`  - ${line(item.name, item.price)}`);
        }
      }
    }
    const retiredIds = new Set(oldCategories.map((category) => category.id));
    for (const item of oldItems) {
      if (!retiredIds.has(item.categoryId)) {
        console.log(
          `  - ${line(item.name, item.price)}  (in ${item.categoryName})`,
        );
      }
    }
    console.log("\n=== New menu ===");
  }

  for (const group of plan.categories) {
    const status = {
      existing: "existing category",
      keep: "kept",
      new: "new category",
      unneeded: "not created: all its items are already on the menu",
    }[group.category.status];
    console.log(`\n${group.name}  (${status})`);

    for (const item of group.items) {
      if (item.action === "add") {
        console.log(`  + ${line(item.name, item.price)}`);
      } else if (item.action === "keep" || !item.differs) {
        console.log(`  = ${line(item.name, item.price)}`);
      } else {
        const { existing } = item;
        console.log(
          `  ! ${line(item.name, item.price)}  is "${existing.name}" in ` +
            `${existing.categoryName} at ${toAmount(existing.price)}`,
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
  const { dryRun, replace } = parseArgs(process.argv.slice(2));
  const card = validateCard(MENU_CARD);

  console.log(`Database:  ${describeTarget()}`);
  console.log(
    `Menu card: ${MENU_CARD_SOURCE} — ${card.length} categories, ` +
      `${card.reduce((sum, group) => sum + group.items.length, 0)} items`,
  );
  console.log(
    replace
      ? "Mode:      replace — the card becomes the whole menu"
      : "Mode:      add — only what is missing is added",
  );

  const plan = planImport(card, await readCurrentMenu(), { replace });
  printPlan(plan, replace);

  const planned = plan.categories.flatMap((group) => group.items);
  const newCategories = plan.categories.filter(
    (group) => group.category.status === "new",
  ).length;
  const newItems = planned.filter((item) => item.action === "add").length;
  const differing = planned.filter(
    (item) => item.action === "skip" && item.differs,
  ).length;
  const moves =
    plan.categories.filter(
      ({ category }) =>
        category.status === "keep" &&
        category.existing.sortOrder !== category.sortOrder,
    ).length +
    planned.filter(
      (item) =>
        item.action === "keep" && item.existing.sortOrder !== item.sortOrder,
    ).length;
  const retiring = plan.retire.categories.length + plan.retire.items.length;

  console.log(
    `\nCategories to create:  ${newCategories}` +
      `\nItems to add:          ${newItems}` +
      `\nAlready on the menu:   ${planned.length - newItems}` +
      (differing > 0
        ? ` (${differing} not as the card has it; review in Administration > Items)`
        : "") +
      (replace
        ? `\nCategories to retire:  ${plan.retire.categories.length}` +
          `\nItems to retire:       ${plan.retire.items.length}`
        : ""),
  );

  if (newCategories + newItems + moves + retiring === 0) {
    console.log(
      "\nNothing to do: the menu already has everything on the card.",
    );
    process.exit(0);
  }

  await applyPlan(plan, dryRun);

  if (dryRun) {
    console.log(
      "\nDry run: every write succeeded and was rolled back. Nothing was " +
        `changed. Run without --dry-run to ${replace ? "replace the menu" : "import"}.`,
    );
  } else if (replace) {
    console.log(
      `\nMenu replaced: retired ${plan.retire.categories.length} categories ` +
        `and ${plan.retire.items.length} items; created ${newCategories} ` +
        `categories and ${newItems} items.`,
    );
  } else {
    console.log(
      `\nImported ${newCategories} categories and ${newItems} items.`,
    );
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("\nImport FAILED. Nothing was changed.\n", error);
  process.exit(1);
});
