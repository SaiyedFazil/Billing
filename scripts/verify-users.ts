import { eq, sql } from "drizzle-orm";

import { MAX_FAILED_ATTEMPTS } from "../src/constants/sign-in";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { passwordStamp } from "../src/lib/auth/password-stamp";
import {
  claimSignInAttempt,
  clearFailedLogins,
} from "../src/server/users/login-attempts";
import {
  countActiveSuperadmins,
  findSessionUser,
} from "../src/server/users/users-queries";

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

  // The guard's lookup carries a stamp of the hash, never the hash itself,
  // and the stamp moves when the password does.
  const session = await findSessionUser(probe.id);
  const probeHash = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!.passwordHash;
  check(
    "the session lookup stamps the current password hash",
    session?.passwordStamp === passwordStamp(probeHash),
    session,
  );
  await db
    .update(users)
    .set({ passwordHash: await hashPassword("Another@123") })
    .where(eq(users.id, probe.id));
  check(
    "a password reset changes the stamp, ending older sessions",
    (await findSessionUser(probe.id))?.passwordStamp !== session?.passwordStamp,
  );
  check(
    "the session lookup never returns the password hash",
    session !== undefined && !("passwordHash" in session),
  );

  // Every attempt is counted before its password is checked. Five without a
  // correct password lock the account; a good sign-in clears the lock.
  const claims: Awaited<ReturnType<typeof claimSignInAttempt>>[] = [];
  for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
    claims.push(await claimSignInAttempt(probe.id));
  }
  check(
    "the first five attempts may check a password",
    claims.every((claim) => claim.allowed),
    claims,
  );
  check(
    "only the fifth attempt reports a lock",
    claims.map((claim) => claim.lockedUntil !== null).join() ===
      "false,false,false,false,true",
    claims,
  );
  const locked = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!;
  check(
    "five attempts without a correct password lock the account",
    locked.failedAttempts === MAX_FAILED_ATTEMPTS &&
      locked.lockedUntil !== null &&
      locked.lockedUntil > new Date(),
    { failedAttempts: locked.failedAttempts, lockedUntil: locked.lockedUntil },
  );
  const sixth = await claimSignInAttempt(probe.id);
  check(
    "a sixth attempt is refused while the account is locked",
    !sixth.allowed &&
      sixth.lockedUntil?.getTime() === locked.lockedUntil?.getTime(),
    sixth,
  );

  await clearFailedLogins(probe.id);

  // Guesses sent together queue on the row: they cannot all pass the lock
  // check before any of them is counted.
  const together = await Promise.all(
    Array.from({ length: 12 }, () => claimSignInAttempt(probe.id)),
  );
  check(
    "of 12 attempts sent at once, only five reach a password check",
    together.filter((claim) => claim.allowed).length === MAX_FAILED_ATTEMPTS,
    together,
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
