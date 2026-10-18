import type { db } from "@/db";

/** The transaction handle db.transaction() hands its callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
