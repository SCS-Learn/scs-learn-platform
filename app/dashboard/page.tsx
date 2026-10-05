import { redirect } from "next/navigation";
import { getCurrentInstructor } from "@/lib/instructor/data/current-instructor";

/**
 * Role router: the default landing spot after sign-in, and what the landing
 * page's "Sign in" resolves to. Instructors go to their dashboard, everyone
 * else to their courses. (Signed-out visitors never get here - proxy.ts sends
 * them to /login first.)
 */
export default async function DashboardRedirectPage() {
  redirect((await getCurrentInstructor()) ? "/instructor" : "/student");
}
