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
const claims = { id: ID, sessionVersion: 3 };
const record: SessionUserRecord = {
  id: ID,
  name: "Asha",
  username: "asha",
  role: "ADMIN",
  isActive: true,
  sessionVersion: 3,
};

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
  "a deactivated account has no session",
  currentSessionUser(claims, { ...record, isActive: false }),
  null,
);
check(
  "a password reset (version moved on) ends the session",
  currentSessionUser(claims, { ...record, sessionVersion: 4 }),
  null,
);
check(
  "a cookie from before session versions existed is rejected",
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

console.log(
  failures === 0 ? "\nAll auth checks passed." : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
