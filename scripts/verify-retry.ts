import { withConnectionRetry } from "../src/db/with-connection-retry";

let failures = 0;

function report(label: string, pass: boolean, detail?: unknown) {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}`, pass ? "" : (detail ?? ""));
}

async function main() {
  // A non-connection error must propagate on the first attempt.
  let attempts = 0;
  try {
    await withConnectionRetry(async () => {
      attempts += 1;
      throw Object.assign(new Error("syntax error"), { code: "42601" });
    }, 10);
  } catch {
    /* expected */
  }
  report("real errors are not retried", attempts === 1, `attempts=${attempts}`);

  // A connection error must be retried exactly once (two attempts total).
  attempts = 0;
  try {
    await withConnectionRetry(async () => {
      attempts += 1;
      throw Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    }, 10);
  } catch {
    /* expected */
  }
  report("connection errors retried once", attempts === 2, `attempts=${attempts}`);

  // A retry that succeeds must return the value, not throw.
  attempts = 0;
  const value = await withConnectionRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(new Error("waking up"), { code: "57P03" });
    }
    return "recovered";
  }, 10);
  report(
    "a successful retry returns the value",
    value === "recovered" && attempts === 2,
    `value=${value} attempts=${attempts}`,
  );

  // A first-try success must not retry.
  attempts = 0;
  await withConnectionRetry(async () => {
    attempts += 1;
    return null;
  }, 10);
  report("success does not retry", attempts === 1, `attempts=${attempts}`);

  console.log(
    failures === 0 ? "\nAll retry checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
