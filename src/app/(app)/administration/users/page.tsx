import { UsersTab } from "@/components/pages/administration/users/UsersTab";
import { requireSuperadmin } from "@/lib/auth/guard";
import { listUsers } from "@/server/users/users-queries";

export const metadata = {
  title: "Accounts",
  description: "Manage who can sign in.",
};

export default async function Page() {
  const actor = await requireSuperadmin();
  const users = await listUsers();

  return <UsersTab users={users} currentUserId={actor.id} />;
}
