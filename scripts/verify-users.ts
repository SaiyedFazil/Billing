import { eq, sql } from "drizzle-orm";

import { MAX_FAILED_ATTEMPTS } from "../src/constants/sign-in";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import {
  clearFailedLogins,
  registerFailedLogin,
} from "../src/server/users/login-attempts";
import { countActiveSuperadmins } from "../src/server/users/users-queries";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  const activeOwners = await countActiveSuperadmins();
  check(
    "at least one active superadmin exists",
    activeOwners >= 1,
    activeOwners,
  );

  const [anyOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "SUPERADMIN"))
    .limit(1);

  check(
    "excluding one owner reduces the count by one",
    (await countActiveSuperadmins(anyOwner.id)) === activeOwners - 1,
  );

  // A deactivated superadmin must not be counted as active.
  await db.execute(sql`DELETE FROM users WHERE username = 'invariant-probe'`);
  const [probe] = await db
    .insert(users)
    .values({
      username: "invariant-probe",
      name: "Probe",
      role: "SUPERADMIN",
      passwordHash: await hashPassword("Probe@12345"),
    })
    .returning({ id: users.id });

  const withProbe = await countActiveSuperadmins();
  await db.update(users).set({ isActive: false }).where(eq(users.id, probe.id));
  const withoutProbe = await countActiveSuperadmins();

  check(
    "a deactivated superadmin is not counted as active",
    withoutProbe === withProbe - 1,
    { withProbe, withoutProbe },
  );

  // A reset must change the hash and invalidate the old password.
  const oldHash = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!.passwordHash;

  await db
    .update(users)
    .set({ passwordHash: await hashPassword("NewProbe@123") })
    .where(eq(users.id, probe.id));

  const newHash = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!.passwordHash;

  check("a password reset changes the stored hash", oldHash !== newHash);
  check(
    "the old password no longer verifies",
    !(await verifyPassword("Probe@12345", newHash)),
  );
  check(
    "the new password verifies",
    await verifyPassword("NewProbe@123", newHash),
  );
  check(
    "the hash is bcrypt, not plaintext",
    newHash.startsWith("$2") && !newHash.includes("NewProbe"),
  );

  // Wrong passwords lock the account; a good sign-in clears the lock.
  for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
    await registerFailedLogin("invariant-probe");
  }
  const locked = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!;
  check(
    "five wrong passwords lock the account",
    locked.failedAttempts === MAX_FAILED_ATTEMPTS &&
      locked.lockedUntil !== null &&
      locked.lockedUntil > new Date(),
    { failedAttempts: locked.failedAttempts, lockedUntil: locked.lockedUntil },
  );

  await clearFailedLogins(probe.id);
  const cleared = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!;
  check(
    "a successful sign-in clears the lock",
    cleared.failedAttempts === 0 && cleared.lockedUntil === null,
    {
      failedAttempts: cleared.failedAttempts,
      lockedUntil: cleared.lockedUntil,
    },
  );

  await db.execute(sql`DELETE FROM users WHERE username = 'invariant-probe'`);

  console.log(
    failures === 0 ? "\nAll user checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
