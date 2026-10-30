/** What the sign-in form says while an account is locked. */
export function lockoutMessage(lockedUntil: Date, now = new Date()): string {
  const minutes = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000),
  );
  const wait = minutes === 1 ? "1 minute" : `${minutes} minutes`;
  return `Too many failed attempts, so this account is locked. Try again in ${wait}, or ask the owner to reset the password.`;
}
