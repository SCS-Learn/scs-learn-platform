/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Drive's API
 * rate-limits per user, and a bulk import can easily see 1000+ files in one
 * folder tree (a "Recitations" or "Code Repository" subfolder, say) - firing
 * every file's Drive request from a single unbounded Promise.all reliably
 * trips that limit, and every one of those requests then looks to the caller
 * like a genuinely unreadable file.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
