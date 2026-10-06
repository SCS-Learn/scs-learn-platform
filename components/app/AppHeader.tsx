import { displayNameFor, getSessionUser, initialsFor } from "@/lib/auth/session";
import { getCurrentInstructor } from "@/lib/instructor/data/current-instructor";
import { getIsAdmin } from "@/lib/admin/session";
import AppHeaderBar from "./AppHeaderBar";

/**
 * The one header for every signed-in page (student, instructor, account).
 * Server component: resolves who's signed in and whether they teach, so the
 * bar can show the right tabs; the interactive bits live in AppHeaderBar.
 */
export default async function AppHeader({
  mode,
  backHref,
  backLabel,
}: {
  mode: "learning" | "teaching" | "account" | "admin";
  backHref?: string;
  backLabel?: string;
}) {
  const [user, instructor, isAdmin] = await Promise.all([getSessionUser(), getCurrentInstructor(), getIsAdmin()]);
  const name = (mode === "teaching" && instructor?.name) || (user ? displayNameFor(user) : "Guest");
  return (
    <AppHeaderBar
      mode={mode}
      name={name}
      initials={initialsFor(name)}
      email={user?.email ?? null}
      isInstructor={Boolean(instructor)}
      isAdmin={isAdmin}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
