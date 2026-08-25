import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";

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

/** Dumps one parsing call's input/output atoms to disk for manual inspection during development. */
export async function writeAtomRecord(label: string, data: unknown): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  await mkdir(ATOM_STORE_DIR, { recursive: true });
  sequence += 1;
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const filePath = path.join(ATOM_STORE_DIR, `${String(sequence).padStart(3, "0")}-${safeLabel}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
