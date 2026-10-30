import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// Neon's driver speaks the Postgres wire protocol over a WebSocket, which is
// what gives us real interactive transactions (BEGIN/COMMIT/ROLLBACK). The
// HTTP driver cannot do that, and bill creation depends on it. See spec §4.3.
//
// Node 22+ ships a global WebSocket, but Netlify's runtime is not guaranteed
// to expose one, so supply an implementation when it is absent.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

type BillingDatabase = NeonDatabase<typeof schema>;

// Reuse the POOL across hot reloads in development, otherwise every file save
// opens a new pool and exhausts Neon's connection limit.
//
// Only the pool. The Drizzle client is built with the schema, so caching it
// here kept the schema the dev server first loaded: after a migration dropped
// users.session_version, every sign-in still asked for it and failed until
// the server was restarted. The client is a cheap wrapper with no connection
// of its own, so it is rebuilt whenever this module is.
const globalForDb = globalThis as unknown as { billingPool?: Pool };

function getPool(): Pool {
  if (globalForDb.billingPool) return globalForDb.billingPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.template to .env.local and paste " +
        "your Neon pooled connection string (it must contain '-pooler').",
    );
  }

  const pool = new Pool({ connectionString });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.billingPool = pool;
  }
  return pool;
}

let database: BillingDatabase | undefined;

function getDatabase(): BillingDatabase {
  database ??= drizzle(getPool(), { schema });
  return database;
}

/**
 * The Drizzle client.
 *
 * Deliberately lazy: connecting is deferred until the first property access,
 * so importing this module during `next build` does not require DATABASE_URL
 * and does not open a connection at build time. A missing URL then fails at
 * query time with the clear message above rather than a cryptic driver error.
 */
export const db = new Proxy({} as BillingDatabase, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property, database);
    // Bind methods to the real instance so `this` is never the Proxy.
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export type Db = BillingDatabase;
