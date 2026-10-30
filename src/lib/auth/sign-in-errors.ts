import { CredentialsSignin } from "next-auth";

/**
 * Thrown by authorize() when the account is locked after too many failed
 * attempts. Auth.js passes its own error types through server-side signIn()
 * unchanged, so loginAction receives this instance with `lockedUntil` intact.
 */
export class AccountLocked extends CredentialsSignin {
  code = "account_locked";

  constructor(readonly lockedUntil: Date) {
    super();
  }
}
