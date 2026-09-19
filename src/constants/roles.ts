export const ROLES = ["ADMIN", "SUPERADMIN"] as const;
export type Role = (typeof ROLES)[number];

/** What the shop calls these roles, rather than what the database calls them. */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Cashier",
  SUPERADMIN: "Owner",
};
