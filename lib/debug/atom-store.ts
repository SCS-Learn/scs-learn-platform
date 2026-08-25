import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import type { Atom } from "@/lib/google/extract-file-atoms";

const ATOM_STORE_DIR = path.join(process.cwd(), "debug", "atoms");

let sequence = 0;

/**
 * Clears out atoms left over from the previous import run. Call once at the
 * start of a run so the folder only ever reflects the run in progress.
 */
export async function flushAtomStore(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  sequence = 0;
  await rm(ATOM_STORE_DIR, { recursive: true, force: true });
  await mkdir(ATOM_STORE_DIR, { recursive: true });
}

/** Quick density/shape check for a file's atoms - count, split by modality/role, and how confident the model was overall. */
export function summarizeAtoms(atoms: Atom[]): {
  count: number;
  byModality: Record<string, number>;
  byRole: Record<string, number>;
  avgConfidence: number | null;
  flagged: number;
} {
  const byModality: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  let confidenceSum = 0;
  let flagged = 0;
  for (const atom of atoms) {
    byModality[atom.modality] = (byModality[atom.modality] ?? 0) + 1;
    byRole[atom.role] = (byRole[atom.role] ?? 0) + 1;
    confidenceSum += atom.confidence;
    if (atom.flags.length > 0) flagged += 1;
  }
  return {
    count: atoms.length,
    byModality,
    byRole,
    avgConfidence: atoms.length > 0 ? confidenceSum / atoms.length : null,
    flagged,
  };
}

/** Dumps one parsing call's input/output atoms to disk for manual inspection during development. */
export async function writeAtomRecord(label: string, data: unknown): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  await mkdir(ATOM_STORE_DIR, { recursive: true });
  sequence += 1;
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const filePath = path.join(ATOM_STORE_DIR, `${String(sequence).padStart(3, "0")}-${safeLabel}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
