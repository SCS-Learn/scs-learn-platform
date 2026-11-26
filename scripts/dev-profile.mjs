import { lstatSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { hostedDevOrigins } from "./dev-targets.mjs";

const rootUrl = new URL("../", import.meta.url);
export const projectRoot = fileURLToPath(rootUrl);

const defaultProfile = ".env.dev";
const profileKinds = new Map([
  [defaultProfile, "shared"],
  [".env.dev.personal", "personal"],
]);
const nextDevelopmentFallbacks = [
  ".env.development.local",
  ".env.local",
  ".env.development",
  ".env",
];
const supabaseUrlKey = "NEXT_PUBLIC_SUPABASE_URL";

export function parseProfileArgs(argv) {
  let envFile;
  const args = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      args.push(...argv.slice(index));
      break;
    }
    if (arg === "--env-file" || arg.startsWith("--env-file=")) {
      if (envFile !== undefined) throw new Error("Specify --env-file only once.");
      envFile = arg === "--env-file" ? argv[++index] : arg.slice("--env-file=".length);
      if (!envFile) throw new Error("Choose .env.dev or .env.dev.personal with --env-file.");
    } else {
      args.push(arg);
    }
  }

  return { envFile: envFile ?? defaultProfile, args };
}

export function classifySupabaseTarget(rawUrl) {
  // An API origin has no credentials, path, query or fragment.
  const input = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!/^https?:\/\/(?:[a-z\d.-]+|\[[a-f\d:]+\])(?::\d+)?\/?$/i.test(input)) {
    throw new Error(`${supabaseUrlKey} must be an HTTP(S) origin.`);
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`${supabaseUrlKey} must be an HTTP(S) origin.`);
  }

  const { hostname, origin, protocol } = url;
  if (hostname === "localhost" || hostname === "[::1]" || (isIP(hostname) === 4 && hostname.startsWith("127."))) {
    return { kind: "loopback", origin };
  }
  if (protocol === "https:") {
    if (hostedDevOrigins.shared.includes(origin)) return { kind: "shared", origin };
    if (hostedDevOrigins.personal.includes(origin)) return { kind: "personal", origin };
  }
  throw new Error(`${supabaseUrlKey} must use loopback or an approved HTTPS development origin in scripts/dev-targets.mjs.`);
}

export function loadDevProfile({ envFile = defaultProfile, requiredKeys = [] } = {}) {
  const profileKind = profileKinds.get(envFile);
  if (!profileKind) throw new Error("Choose .env.dev or .env.dev.personal with --env-file.");

  const fallbackFiles = nextDevelopmentFallbacks.filter((file) => {
    try {
      lstatSync(new URL(file, rootUrl));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw new Error(`Cannot check for Next.js fallback file ${file}.`);
    }
  });
  if (fallbackFiles.length) {
    throw new Error(
      `Move development settings into ${envFile} (see .env.dev.example), then remove Next.js fallback files from the project root: ${fallbackFiles.join(", ")}.`,
    );
  }

  let values;
  try {
    values = parseEnv(readFileSync(new URL(envFile, rootUrl), "utf8"));
  } catch {
    throw new Error(`Cannot read ${envFile}. Copy .env.dev.example to ${envFile} and fill in the required settings.`);
  }

  const missing = [...new Set([supabaseUrlKey, ...requiredKeys])].filter(
    (key) => !Object.hasOwn(values, key) || !values[key].trim(),
  );
  if (missing.length) throw new Error(`${envFile} is missing required settings: ${missing.join(", ")}.`);

  const target = classifySupabaseTarget(values[supabaseUrlKey]);
  if (target.kind !== "loopback" && target.kind !== profileKind) {
    throw new Error(`${envFile} must use a ${profileKind} development origin or loopback.`);
  }
  values[supabaseUrlKey] = target.origin;

  return { envFile, values, target };
}
