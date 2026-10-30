import bcrypt from "bcryptjs";

// bcryptjs rather than bcrypt: pure JavaScript, no native build step, which
// matters on Netlify's build image.
const COST = 12;

// A real hash, at the same cost, of a random password nobody kept. Signing in
// as a username that does not exist checks against it, so that failure takes
// as long as a wrong password (~250 ms) and the response time cannot reveal
// which usernames are real.
const DUMMY_HASH =
  "$2b$12$A1mG6XNCTOzraMBC7Q4oo.w3V479Bv04PYZw9eX0Ob/KVRcZaIZ3C";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/** Pass `null` when there is no account; it still costs a full check. */
export async function verifyPassword(
  plain: string,
  hash: string | null,
): Promise<boolean> {
  if (hash === null) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
