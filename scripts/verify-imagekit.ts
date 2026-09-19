import { createHmac } from "node:crypto";

import { getUploadAuth, thumbnailUrl } from "../src/lib/storage";

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
  const auth = getUploadAuth();

  check("token is a uuid", /^[0-9a-f-]{36}$/.test(auth.token), auth.token);
  check(
    "expire is in the future but within an hour",
    auth.expire > Math.floor(Date.now() / 1000) &&
      auth.expire < Math.floor(Date.now() / 1000) + 3600,
    auth.expire,
  );

  const expected = createHmac("sha1", process.env.IMAGEKIT_PRIVATE_KEY!)
    .update(auth.token + auth.expire)
    .digest("hex");
  check("signature is HMAC-SHA1 of token+expire", auth.signature === expected);

  // The single most important check here.
  check(
    "the private key never leaves the server",
    !JSON.stringify(auth).includes(process.env.IMAGEKIT_PRIVATE_KEY!),
  );

  check(
    "thumbnailUrl appends a transformation",
    thumbnailUrl("https://ik.imagekit.io/x/a.jpg") ===
      "https://ik.imagekit.io/x/a.jpg?tr=w-300,h-300,fo-auto,f-webp",
    thumbnailUrl("https://ik.imagekit.io/x/a.jpg"),
  );
  check(
    "thumbnailUrl respects an existing query string",
    thumbnailUrl("https://ik.imagekit.io/x/a.jpg?v=2", 80) ===
      "https://ik.imagekit.io/x/a.jpg?v=2&tr=w-80,h-80,fo-auto,f-webp",
    thumbnailUrl("https://ik.imagekit.io/x/a.jpg?v=2", 80),
  );

  // Live check: ImageKit must actually accept the credentials.
  const authHeader = Buffer.from(
    `${process.env.IMAGEKIT_PRIVATE_KEY}:`,
  ).toString("base64");
  const response = await fetch("https://api.imagekit.io/v1/files?limit=1", {
    headers: { Authorization: `Basic ${authHeader}` },
  });
  check(
    `ImageKit accepts the private key (HTTP ${response.status})`,
    response.ok,
    response.ok ? "" : await response.text().catch(() => ""),
  );

  console.log(
    failures === 0
      ? "\nAll ImageKit checks passed."
      : `\n${failures} FAILURE(S)`,
  );

  // Deliberately NOT process.exit(). This script makes real HTTPS calls, and
  // exiting while undici's keep-alive sockets are still closing crashes the
  // process on Windows with a libuv assertion — which reports as exit 127 even
  // though every check passed. Setting exitCode lets Node drain and exit
  // cleanly with the right code.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
