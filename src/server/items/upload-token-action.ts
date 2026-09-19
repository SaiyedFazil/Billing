"use server";

import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { getUploadAuth, type UploadAuth } from "@/lib/storage";
import { type ActionResult, ok } from "@/lib/utils/result";

/**
 * Only a superadmin can obtain an upload token — otherwise anyone signed in
 * could push arbitrary files into the shop's ImageKit account.
 */
export async function getUploadTokenAction(): Promise<ActionResult<UploadAuth>> {
  return guarded(async () => {
    await requireSuperadmin();
    return ok(getUploadAuth());
  });
}
