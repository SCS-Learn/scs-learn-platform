"use server";

import { isCogniterraOAuthConnected } from "@/lib/cogniterra/oauth-client";

/** Whether the single stub instructor has connected their Cogniterra account. A thin server action so client components never import lib/cogniterra/oauth-client.ts (server-only: touches the admin/service-role client) directly. */
export async function getCogniterraOAuthConnectionStatus(): Promise<boolean> {
  return isCogniterraOAuthConnected();
}
