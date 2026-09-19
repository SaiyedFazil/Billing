import { csvAmount, toCsv } from "../src/lib/utils/csv";
import {
  eachDateInRange,
  isValidIsoDate,
  presetRange,
  shiftIsoDate,
} from "../src/lib/utils/date-range";

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

check("shiftIsoDate forward", shiftIsoDate("2026-08-26", 1), "2026-08-27");
check("shiftIsoDate back", shiftIsoDate("2026-08-01", -1), "2026-07-31");
check(
  "shiftIsoDate across a year",
  shiftIsoDate("2026-01-01", -1),
  "2025-12-31",
);
check(
  "shiftIsoDate across a leap day",
  shiftIsoDate("2028-02-28", 1),
  "2028-02-29",
);

check("isValidIsoDate accepts", isValidIsoDate("2026-08-26"), true);
check(
  "isValidIsoDate rejects a bad shape",
  isValidIsoDate("26/08/2026"),
  false,
);
check("isValidIsoDate rejects junk", isValidIsoDate("hello"), false);
check("isValidIsoDate rejects empty", isValidIsoDate(""), false);

check(
  "eachDateInRange is inclusive",
  eachDateInRange("2026-08-25", "2026-08-27"),
  ["2026-08-25", "2026-08-26", "2026-08-27"],
);
check(
  "eachDateInRange single day",
  eachDateInRange("2026-08-25", "2026-08-25"),
  ["2026-08-25"],
);
check(
  "eachDateInRange handles an inverted range",
  eachDateInRange("2026-08-27", "2026-08-25"),
  [],
);

const last7 = presetRange("LAST_7", "Asia/Kolkata");
check(
  "LAST_7 spans seven days inclusive",
  eachDateInRange(last7.from, last7.to).length,
  7,
);
const last30 = presetRange("LAST_30", "Asia/Kolkata");
check(
  "LAST_30 spans thirty days inclusive",
  eachDateInRange(last30.from, last30.to).length,
  30,
);
const today = presetRange("TODAY", "Asia/Kolkata");
check("TODAY is a single day", today.from === today.to, true);

check("csvAmount", csvAmount("60.50"), "60.50");
check("csvAmount zero", csvAmount("0.00"), "0.00");
check("csvAmount pads", csvAmount("60.5"), "60.50");

const csv = toCsv(
  [{ name: 'Burger, "large"', qty: 2 }],
  [
    { header: "Item", value: (r) => r.name },
    { header: "Qty", value: (r) => r.qty },
  ],
);
check(
  "toCsv escapes commas and quotes",
  csv,
  '﻿Item,Qty\r\n"Burger, ""large""",2\r\n',
);

const multiline = toCsv(
  [{ note: "line one\nline two" }],
  [{ header: "Note", value: (r) => r.note }],
);
check(
  "toCsv quotes embedded newlines",
  multiline,
  '﻿Note\r\n"line one\nline two"\r\n',
);

console.log(
  failures === 0
    ? "\nAll report utility checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
