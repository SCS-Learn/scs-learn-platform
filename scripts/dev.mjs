import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadDevProfile, parseProfileArgs, projectRoot } from "./dev-profile.mjs";

const require = createRequire(import.meta.url);

const runtimeKeys = [
  "PATH", "PATHEXT", "SystemRoot", "ComSpec", "HOME", "USERPROFILE",
  "TMPDIR", "TMP", "TEMP", "TERM", "LANG", "LC_ALL", "NEXT_TELEMETRY_DISABLED",
];
const requiredKeys = ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const appKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  ...requiredKeys,
  "NEXT_PUBLIC_SITE_URL",
  "ANTHROPIC_API_KEY",
  "COGNITERRA_API_URL",
  "COGNITERRA_CONSUMER_KEY",
  "COGNITERRA_COURSE_ID",
  "COGNITERRA_LAUNCH_URL",
  "COGNITERRA_OAUTH_BASE_URL",
  "COGNITERRA_OAUTH_CLIENT_ID",
  "COGNITERRA_OAUTH_CLIENT_SECRET",
  "COGNITERRA_SHARED_SECRET",
  "DRIVE_IMPORT_SKIP_AI",
  "GOOGLE_API_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "LTI_TOOL_KID",
  "LTI_TOOL_PRIVATE_KEY",
];

function validatePublicSupabaseKey(values) {
  const publicKey = values.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();
  let jwtRole;
  try {
    const [, payload] = publicKey.split(".");
    if (payload) jwtRole = JSON.parse(Buffer.from(payload, "base64url").toString()).role;
  } catch {
    // Publishable keys need no JWT decoding.
  }

  if (publicKey.startsWith("sb_secret_") || jwtRole === "service_role" || publicKey === values.SUPABASE_SERVICE_ROLE_KEY.trim()) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY must contain an anon or publishable key. Put the server-only key in SUPABASE_SERVICE_ROLE_KEY.");
  }
}

function pickEnv(source, keys) {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
}

function start() {
  const { envFile, args } = parseProfileArgs(process.argv.slice(2));
  const { values } = loadDevProfile({ envFile, requiredKeys });
  validatePublicSupabaseKey(values);

  const env = {
    ...pickEnv(process.env, runtimeKeys),
    ...pickEnv(values, appKeys),
    NODE_ENV: "development",
  };
  const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", projectRoot, ...args], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });

  const interrupt = () => next.kill("SIGINT");
  const terminate = () => next.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  next.once("error", () => {
    console.error("Could not start Next.js. Install dependencies with npm ci and retry.");
  });
  next.once("close", (code, signal) => {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  });
}

try {
  start();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
