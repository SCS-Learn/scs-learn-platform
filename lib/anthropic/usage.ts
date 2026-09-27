import type Anthropic from "@anthropic-ai/sdk";

/**
 * Emits one greppable line per Claude call so import cost can be rolled up per
 * run instead of guessed at. Sum a run with:
 *   grep anthropic_usage <log> | jq -s 'group_by(.label)[] | {label: .[0].label, calls: length, input: map(.input) | add, output: map(.output) | add}'
 */
export function logAnthropicUsage(
  label: string,
  response: { model: string; usage: Anthropic.Usage }
): void {
  const usage = response.usage;
  console.log(
    JSON.stringify({
      tag: "anthropic_usage",
      label,
      model: response.model,
      input: usage.input_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_write: usage.cache_creation_input_tokens ?? 0,
      output: usage.output_tokens,
    })
  );
}
