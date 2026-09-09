function parseNumber(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function roundToSigFigs(value: number, sigFigs: number): number {
  if (!Number.isFinite(value) || sigFigs < 1) return value;
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (sigFigs - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

export function gradeSignificantFigures(
  response: string,
  key: { value: number; sigFigs: number }
): boolean {
  const n = parseNumber(response);
  if (n === null) return false;
  const expected = roundToSigFigs(key.value, key.sigFigs);
  const actual = roundToSigFigs(n, key.sigFigs);
  return Math.abs(actual - expected) <= 1e-9;
}
