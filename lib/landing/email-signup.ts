"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type EmailSignupState =
  | { status: "idle" }
  | { status: "done"; email: string }
  | { status: "error"; message: string };

const MAX_EMAIL_LENGTH = 254;

/**
 * Landing-page "Claim my spot". Stores the address in email_signups (see
 * supabase/migrations/add-email-signups.sql). Signing up twice is not an
 * error - the second submit just reports success again - so the form never
 * reveals whether an address is already on the list.
 */
export async function joinEmailList(_prev: EmailSignupState, formData: FormData): Promise<EmailSignupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const source = String(formData.get("source") ?? "landing").slice(0, 40);

  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("joinEmailList: SUPABASE_SERVICE_ROLE_KEY is not configured");
    return { status: "error", message: "Signups are unavailable right now. Please try again later." };
  }

  const { error } = await admin
    .from("email_signups")
    .upsert({ email, source }, { onConflict: "email", ignoreDuplicates: true });
  if (error) {
    // Most likely the migration hasn't been run yet.
    console.error("joinEmailList:", error.message);
    return { status: "error", message: "Signups are unavailable right now. Please try again later." };
  }

  return { status: "done", email };
}
