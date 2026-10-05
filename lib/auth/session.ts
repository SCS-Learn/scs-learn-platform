import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in Supabase Auth user for this request, or null. Every role check
 * (learner, instructor) starts here. getUser() revalidates the token with
 * Supabase rather than trusting the cookie, and React's cache() keeps that to
 * one round trip per request however many callers ask.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Display name: the full_name set at sign-up or on /account, else the email's local part. */
export function displayNameFor(user: User): string {
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  return fullName || (user.email ?? "").split("@")[0] || "Learner";
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
