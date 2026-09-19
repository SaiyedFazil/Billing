export {
  deleteFile,
  getUploadAuth,
  UPLOAD_ENDPOINT,
  type UploadAuth,
} from "./imagekit";

/**
 * The billing grid loads dozens of images at once, so never serve originals.
 * ImageKit resizes and converts to WebP on the fly: a 4 MB phone photo becomes
 * roughly a 20 KB thumbnail.
 */
export function thumbnailUrl(url: string, size = 300): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}tr=w-${size},h-${size},fo-auto,f-webp`;
}

/**
 * Swap this module's contents to move to Cloudflare R2 or S3 — nothing outside
 * `lib/storage/` knows which provider is in use. See spec §4.5.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
