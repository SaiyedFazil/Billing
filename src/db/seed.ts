import { eq, sql } from "drizzle-orm";

import { hashPassword } from "../lib/auth/password";
import { db } from "./index";
import { categories, items, shopSettings, users } from "./schema";

/** Prices are rupees, written exactly as they appear on the menu board. */
const SAMPLE_MENU: Array<{
  category: string;
  sortOrder: number;
  items: Array<{ name: string; price: string }>;
}> = [
  {
    category: "Burgers",
    sortOrder: 1,
    items: [
      { name: "Veg Burger", price: "60.00" },
      { name: "Cheese Burger", price: "80.00" },
      { name: "Chicken Burger", price: "110.00" },
    ],
  },
  {
    category: "Sides",
    sortOrder: 2,
    items: [
      { name: "French Fries", price: "40.00" },
      { name: "Peri Peri Fries", price: "50.00" },
      { name: "Nuggets (6 pc)", price: "90.00" },
    ],
  },
  {
    category: "Drinks",
    sortOrder: 3,
    items: [
      { name: "Coke Small", price: "30.00" },
      { name: "Coke Large", price: "50.00" },
      { name: "Cold Coffee", price: "70.00" },
    ],
  },
];

async function main() {
  const username = process.env.SEED_SUPERADMIN_USERNAME;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  const name = process.env.SEED_SUPERADMIN_NAME;

  if (!username || !password || !name) {
    throw new Error(
      "SEED_SUPERADMIN_USERNAME, SEED_SUPERADMIN_PASSWORD and " +
        "SEED_SUPERADMIN_NAME must all be set in .env.local.",
    );
  }
  if (password.length < 8) {
    throw new Error("SEED_SUPERADMIN_PASSWORD must be at least 8 characters.");
  }

  // --- superadmin ---------------------------------------------------
  const existingUser = await db.query.users.findFirst({
    where: sql`lower(${users.username}) = lower(${username})`,
  });

  if (existingUser) {
    console.log(`Superadmin "${username}" already exists — skipping.`);
  } else {
    await db.insert(users).values({
      username,
      passwordHash: await hashPassword(password),
      name,
      role: "SUPERADMIN",
    });
    console.log(`Created superadmin "${username}".`);
  }

  // --- shop settings ------------------------------------------------
  const existingSettings = await db.query.shopSettings.findFirst();
  if (existingSettings) {
    console.log("Shop settings already exist — skipping.");
  } else {
    await db.insert(shopSettings).values({
      id: true,
      shopName: "My Fast Food Shop",
      addressLine: "123 Main Road, City",
      phone: "98765 43210",
      receiptFooter: "Thank you! Visit again",
      printerWidth: "MM_80",
      timezone: "Asia/Kolkata",
    });
    console.log("Created shop settings.");
  }

  // --- sample menu --------------------------------------------------
  for (const group of SAMPLE_MENU) {
    const existingCategory = await db.query.categories.findFirst({
      where: eq(categories.name, group.category),
    });

    const categoryId =
      existingCategory?.id ??
      (
        await db
          .insert(categories)
          .values({ name: group.category, sortOrder: group.sortOrder })
          .returning({ id: categories.id })
      )[0].id;

    let created = 0;
    for (const [index, item] of group.items.entries()) {
      const existingItem = await db.query.items.findFirst({
        where: eq(items.name, item.name),
      });
      if (existingItem) continue;

      await db.insert(items).values({
        categoryId,
        name: item.name,
        price: item.price,
        sortOrder: index,
      });
      created += 1;
    }

    console.log(
      created > 0
        ? `Seeded category "${group.category}" (${created} items).`
        : `Category "${group.category}" already seeded — skipping.`,
    );
  }

  console.log("\nSeed complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed FAILED:", error);
  process.exit(1);
});
