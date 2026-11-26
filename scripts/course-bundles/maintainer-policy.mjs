// Changes require maintainer review. Destination entries are keyed by exact
// Supabase HTTPS origin and pin an independently provisioned database marker.
// Export sources are separate and grant only specific course codes.
export const approvedSources = Object.freeze({
  // "https://SOURCE_REF.supabase.co": ["DEMO101"],
});

export const approvedDestinations = Object.freeze({
  // "https://STAGING_REF.supabase.co": { environment: "staging", id: "<destination marker UUID>" },
});
