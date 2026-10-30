import { lockoutMessage } from "../src/lib/auth/lockout";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { passwordStamp } from "../src/lib/auth/password-stamp";
import {
  currentSessionUser,
  hasOutlivedSignIn,
  SESSION_MAX_AGE_SECONDS,
  type SessionUserRecord,
  usesSecureCookie,
} from "../src/lib/auth/session-policy";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"} — ${label}` +
      (pass
        ? ""
        : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

// ── Whether a session still belongs to a current user ───────────────────────

const ID = "6f1c2a7e-0d4b-4c39-9a51-2b8e7f3d4c10";
const SECRET = "verify-auth-secret";
const OLD_HASH = "$2b$12$oldhasholdhasholdhasholdhasholdhasholdhasholdhashold";
const NEW_HASH = "$2b$12$newhashnewhashnewhashnewhashnewhashnewhashnewhashnew";
const claims = { id: ID, passwordStamp: passwordStamp(OLD_HASH, SECRET) };
const record: SessionUserRecord = {
  id: ID,
  name: "Asha",
  username: "asha",
  role: "ADMIN",
  isActive: true,
  passwordStamp: passwordStamp(OLD_HASH, SECRET),
};

check(
  "a password stamp is the same for the same hash",
  passwordStamp(OLD_HASH, SECRET) === passwordStamp(OLD_HASH, SECRET),
  true,
);
check(
  "a new password hash gives a new stamp",
  passwordStamp(OLD_HASH, SECRET) === passwordStamp(NEW_HASH, SECRET),
  false,
);
check(
  "the stamp depends on AUTH_SECRET, so it cannot be worked out without it",
  passwordStamp(OLD_HASH, SECRET) === passwordStamp(OLD_HASH, "other"),
  false,
);
check(
  "the stamp never contains the hash",
  passwordStamp(OLD_HASH, SECRET).includes("oldhash"),
  false,
);

check(
  "a current session returns its user",
  currentSessionUser(claims, record),
  {
    id: ID,
    name: "Asha",
    username: "asha",
    role: "ADMIN",
  },
);
check(
  "a deleted account has no session",
  currentSessionUser(claims, { ...record, isActive: false }),
  null,
);
check(
  "a password reset (new hash, new stamp) ends the session",
  currentSessionUser(claims, {
    ...record,
    passwordStamp: passwordStamp(NEW_HASH, SECRET),
  }),
  null,
);
check(
  "a cookie from before password stamps existed is rejected",
  currentSessionUser({ id: ID } as typeof claims, record),
  null,
);
check(
  "a user missing from the database has no session",
  currentSessionUser(claims, undefined),
  null,
);
check(
  "a record for another user is never accepted",
  currentSessionUser(claims, { ...record, id: "someone-else" }),
  null,
);
check(
  "the role comes from the database, not the cookie",
  currentSessionUser(claims, { ...record, role: "SUPERADMIN" })?.role,
  "SUPERADMIN",
);
check(
  "the name comes from the database, not the cookie",
  currentSessionUser(claims, { ...record, name: "Asha K" })?.name,
  "Asha K",
);

// ── How long a sign-in lasts ────────────────────────────────────────────────

const SIGNED_IN = 1_793_000_000; // epoch seconds
const HOUR = 60 * 60;

check("a sign-in lasts ten hours", SESSION_MAX_AGE_SECONDS, 10 * HOUR);
check(
  "a session just signed in is live",
  hasOutlivedSignIn(SIGNED_IN, SIGNED_IN),
  false,
);
check(
  "a session one second short of ten hours is live",
  hasOutlivedSignIn(SIGNED_IN, SIGNED_IN + 10 * HOUR - 1),
  false,
);
check(
  "a session ends at exactly ten hours",
  hasOutlivedSignIn(SIGNED_IN, SIGNED_IN + 10 * HOUR),
  true,
);
check(
  "a session past ten hours stays ended, however recently it was used",
  hasOutlivedSignIn(SIGNED_IN, SIGNED_IN + 30 * HOUR),
  true,
);
check(
  "a token with no sign-in time predates the rule and is ended",
  hasOutlivedSignIn(undefined, SIGNED_IN),
  true,
);
check(
  "a sign-in time that is not a number is ended",
  hasOutlivedSignIn(String(SIGNED_IN), SIGNED_IN),
  true,
);

// ── What a locked account is told ───────────────────────────────────────────

const LOCK_SET = new Date("2026-10-30T06:43:16Z");
const UNLOCKS = new Date("2026-10-30T06:48:16Z");

check(
  "a fresh lock says five minutes",
  lockoutMessage(UNLOCKS, LOCK_SET).includes("Try again in 5 minutes"),
  true,
);
check(
  "part of a minute left rounds up",
  lockoutMessage(UNLOCKS, new Date("2026-10-30T06:46:30Z")).includes(
    "Try again in 2 minutes",
  ),
  true,
);
check(
  "the last minute is singular",
  lockoutMessage(UNLOCKS, new Date("2026-10-30T06:48:00Z")).includes(
    "Try again in 1 minute,",
  ),
  true,
);
check(
  "a lock just expiring never says 0 minutes",
  lockoutMessage(UNLOCKS, UNLOCKS).includes("Try again in 1 minute,"),
  true,
);

// ── Which cookie name the proxy reads ───────────────────────────────────────

check(
  "an https AUTH_URL means the __Secure- cookie",
  usesSecureCookie("https://shop.netlify.app", "http://internal:3000/bill"),
  true,
);
check(
  "an http AUTH_URL means the plain cookie",
  usesSecureCookie("http://localhost:3000", "http://localhost:3000/bill"),
  false,
);
check(
  "without AUTH_URL an https request means the __Secure- cookie",
  usesSecureCookie(undefined, "https://shop.netlify.app/bill"),
  true,
);
check(
  "an empty AUTH_URL counts as unset",
  usesSecureCookie("", "https://shop.netlify.app/bill"),
  true,
);

// ── An unknown username costs as much as a wrong password ───────────────────

async function timed(run: () => Promise<boolean>) {
  const start = performance.now();
  const result = await run();
  return { result, ms: Math.round(performance.now() - start) };
}

async function main() {
  const hash = await hashPassword("Correct@123");
  const wrong = await timed(() => verifyPassword("Wrong@1234", hash));
  const noAccount = await timed(() => verifyPassword("Wrong@1234", null));

  check("a wrong password does not verify", wrong.result, false);
  check("a username with no account never verifies", noAccount.result, false);
  check(
    `no account still costs a full bcrypt check (${noAccount.ms} ms vs ${wrong.ms} ms)`,
    noAccount.ms > wrong.ms / 2,
    true,
  );

  console.log(
    failures === 0 ? "\nAll auth checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
