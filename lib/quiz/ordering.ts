import { asObjectChoices, asStringChoices, parseJson } from "@/lib/quiz/parse";
import type { QuestionChoices } from "@/lib/quiz/types";

export type OrderingConfig = {
  items: string[];
  displayOrder: string[];
};

/** Parse stored choices — supports legacy string[] or { items, displayOrder }. */
export function parseOrderingChoices(choices: QuestionChoices): OrderingConfig | null {
  const stringChoices = asStringChoices(choices);
  if (stringChoices && stringChoices.length > 0) {
    const items = stringChoices.map((s) => s.trim()).filter(Boolean);
    return { items, displayOrder: [...items] };
  }

  const obj = asObjectChoices(choices);
  if (!obj) return null;

  const items = ((obj.items as string[]) ?? []).map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return null;

  const rawDisplay = (obj.displayOrder as string[]) ?? items;
  const displayOrder = sanitizeOrder(rawDisplay, items);
  return { items, displayOrder };
}

/** Keep only known items; append any missing items at the end. */
export function sanitizeOrder(order: string[], items: string[]): string[] {
  const set = new Set(items);
  const result: string[] = [];
  for (const entry of order) {
    const trimmed = entry.trim();
    if (trimmed && set.has(trimmed) && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  }
  for (const item of items) {
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

export function parseOrderingAnswerKey(answerKey: string | null): string[] | null {
  if (!answerKey) return null;
  const parsed = parseJson<string[]>(answerKey);
  if (!parsed || !Array.isArray(parsed)) return null;
  return parsed.map((s) => String(s).trim()).filter(Boolean);
}

export function orderingChoicesFromConfig(config: OrderingConfig): QuestionChoices {
  return {
    items: config.items,
    displayOrder: config.displayOrder,
  };
}

export function renameOrderingItem(
  config: OrderingConfig,
  oldLabel: string,
  newLabel: string
): OrderingConfig {
  const trimmed = newLabel.trim();
  if (!trimmed || oldLabel === trimmed) return config;
  const replace = (list: string[]) => list.map((s) => (s === oldLabel ? trimmed : s));
  const items = replace(config.items);
  return {
    items: [...new Set(items)],
    displayOrder: sanitizeOrder(replace(config.displayOrder), items),
  };
}

export function addOrderingItem(config: OrderingConfig, label: string): OrderingConfig {
  const trimmed = label.trim();
  if (!trimmed || config.items.includes(trimmed)) return config;
  return {
    items: [...config.items, trimmed],
    displayOrder: [...config.displayOrder, trimmed],
  };
}

export function removeOrderingItem(config: OrderingConfig, label: string): OrderingConfig {
  const items = config.items.filter((s) => s !== label);
  return {
    items,
    displayOrder: config.displayOrder.filter((s) => s !== label),
  };
}

export function moveInOrder(order: string[], from: number, to: number): string[] {
  if (to < 0 || to >= order.length || from === to) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function shuffledDisplayOrder(items: string[], correctOrder: string[]): string[] {
  const display = [...items];
  if (display.length < 2) return display;
  const same =
    display.length === correctOrder.length &&
    display.every((v, i) => v === correctOrder[i]);
  if (same) return [...display].reverse();
  return display;
}
/** Student response, or initial display order when not yet set. */
export function effectiveOrderingResponse(
  choices: QuestionChoices,
  response: string
): string[] {
  const parsed = parseJson<unknown>(response);
  const config = parseOrderingChoices(choices);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  }
  return config?.displayOrder ?? [];
}
