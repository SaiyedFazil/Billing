import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { userRoleEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    // Printed on every receipt this user creates.
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull(),
    // Users are deactivated, never deleted — bills reference them.
    isActive: boolean("is_active").notNull().default(true),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    // Copied into the session cookie at sign-in. Adding one ends every
    // session the user has open: the guard rejects a cookie whose number no
    // longer matches. Raised by a password reset and by (de)activation.
    sessionVersion: integer("session_version").notNull().default(0),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Case-insensitive: "Owner" and "owner" are the same login.
    uniqueIndex("users_username_lower_idx").on(sql`lower(${table.username})`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
