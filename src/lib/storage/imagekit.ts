import { createHmac, randomUUID } from "node:crypto";

const UPLOAD_TOKEN_TTL_SECONDS = 10 * 60;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add your ImageKit credentials to .env.local.`,
    );
  }
  return value;
}

export type UploadAuth = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
};

/**
 * Short-lived credentials the BROWSER uses to upload straight to ImageKit.
 *
 * The file never passes through a Netlify function — a 5 MB upload would burn
 * execution time and can exceed the payload limit. See spec §12.2.
 *
 * ImageKit's scheme: signature = HMAC-SHA1(privateKey, token + expire). Only
 * the signature crosses to the client; the private key never does.
 */
export function getUploadAuth(): UploadAuth {
  const privateKey = requireEnv("IMAGEKIT_PRIVATE_KEY");
  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SECONDS;

  const signature = createHmac("sha1", privateKey)
    .update(token + expire)
    .digest("hex");

  return {
    token,
    expire,
    signature,
    publicKey: requireEnv("IMAGEKIT_PUBLIC_KEY"),
    urlEndpoint: requireEnv("IMAGEKIT_URL_ENDPOINT"),
  };
}

/** Permanently removes a file. Called when replacing or clearing an image. */
export async function deleteFile(fileId: string): Promise<void> {
  const privateKey = requireEnv("IMAGEKIT_PRIVATE_KEY");
  // ImageKit uses HTTP Basic with the private key as the username and an
  // empty password.
  const auth = Buffer.from(`${privateKey}:`).toString("base64");

  const response = await fetch(
    `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE", headers: { Authorization: `Basic ${auth}` } },
  );

  // 404 means it is already gone, which is the state we wanted.
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `ImageKit delete failed (${response.status}): ${await response.text()}`,
    );
  }
}

export const UPLOAD_ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";
