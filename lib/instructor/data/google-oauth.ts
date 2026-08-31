"use server";

import { isGoogleOAuthConnected } from "@/lib/google/oauth-client";

/** Whether the single stub instructor has connected their Google account. Client components can't import lib/google/oauth-client.ts directly (it pulls in googleapis/node-only deps), so this thin server action is the bridge. */
export async function getGoogleOAuthConnectionStatus(): Promise<boolean> {
  return isGoogleOAuthConnected();
}
