import {
  currentSessionUser,
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
