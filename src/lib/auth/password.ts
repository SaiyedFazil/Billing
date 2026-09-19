import bcrypt from "bcryptjs";

// bcryptjs rather than bcrypt: pure JavaScript, no native build step, which
// matters on Netlify's build image.
const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
