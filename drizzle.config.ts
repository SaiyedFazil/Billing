import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so it does not pick up .env.local on its
// own. Load it explicitly, falling back to .env for CI.
config({ path: ".env.local" });
config({ path: ".env" });

// `generate` only reads the schema files and needs no connection, so a missing
// URL is a warning here rather than a hard failure. `migrate` and `studio`
// will fail with their own clear error.
if (!process.env.DATABASE_URL) {
  console.warn(
    "[drizzle] DATABASE_URL is not set — `generate` will still work, but " +
      "`migrate` and `studio` need it. Set it in .env.local.",
  );
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
