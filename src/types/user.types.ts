import type { Role } from "@/constants/roles";

export type UserRow = {
  id: string;
  username: string;
  name: string;
  role: Role;
  lockedUntil: Date | null;
  createdAt: Date;
  /** Bills this user has created. Shown so deleting is an informed choice. */
  billCount: number;
};
