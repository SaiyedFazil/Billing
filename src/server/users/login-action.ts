"use server";

import { AuthError, CredentialsSignin } from "next-auth";

import { signIn } from "@/auth";
import { lockoutMessage } from "@/lib/auth/lockout";
import { AccountLocked } from "@/lib/auth/sign-in-errors";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { loginSchema } from "@/lib/validation/user-schema";

export async function loginAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") fields[key] = issue.message;
    }
    return fail("VALIDATION", "Check the details below.", fields);
  }

  try {
    await signIn("credentials", {
      username: parsed.data.username,
      password: parsed.data.password,
      redirect: false,
    });
    return ok(null);
  } catch (error) {
    if (error instanceof AccountLocked) {
      return fail("LOCKED", lockoutMessage(error.lockedUntil));
    }
    if (error instanceof CredentialsSignin) {
      // authorize() returned null. Deliberately vague: never reveal whether
      // the username exists, whether the account is deactivated, or whether
      // it is locked.
      return fail("UNAUTHORIZED", "Incorrect username or password.");
    }
    if (error instanceof AuthError) {
      // authorize() threw — the database is unreachable, or out of step with
      // the code (a migration not yet run). Auth.js wraps that in an AuthError
      // too; reporting it as a wrong password hid the real fault.
      const correlationId = crypto.randomUUID().slice(0, 8);
      console.error(
        `[${correlationId}] Sign-in failed:`,
        error.cause?.err ?? error,
      );
      return fail(
        "UNKNOWN",
        `Sign-in is unavailable right now. Try again in a moment, or quote reference ${correlationId}.`,
      );
    }
    throw error;
  }
}
