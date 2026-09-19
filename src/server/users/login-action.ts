"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
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
    if (error instanceof AuthError) {
      // Deliberately vague: never reveal whether the username exists, whether
      // the account is deactivated, or whether it is locked.
      return fail("UNAUTHORIZED", "Incorrect username or password.");
    }
    throw error;
  }
}
