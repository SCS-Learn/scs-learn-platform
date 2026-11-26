import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { classifySupabaseTarget, parseProfileArgs, projectRoot } from "./dev-profile.mjs";

const loopback = "http://127.0.0.1:54321";
const shared = "https://shared-dev.example.invalid";
const personal = "https://personal-dev.example.invalid:8443";
const production = "https://production.example.invalid";
const anonKey = "dummy-public-key";
const serviceKey = "dummy-server-key";
const selectedValues = (url) => [
  `NEXT_PUBLIC_SUPABASE_URL=${url}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
  "GOOGLE_API_KEY='dummy$PROFILE_REFERENCE'",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=dummy-misnamed-private-value",
  "NODE_ENV=production",
  "NEXT_PRIVATE_DEV_DIR=/different-app",
  "",
].join("\n");

function fixture(t) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "scs-dev-profile-")));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "scripts"));
  for (const file of ["scripts/dev.mjs", "scripts/dev-profile.mjs", "scripts/dev-targets.mjs", "scratch-inspect-course.mjs"]) {
    copyFileSync(join(projectRoot, file), join(cwd, file));
  }

  const nextBin = join(cwd, "node_modules/next/dist/bin");
  mkdirSync(nextBin, { recursive: true });
  writeFileSync(join(nextBin, "next.js"), "console.log(JSON.stringify({ args: process.argv.slice(2), env: process.env }));\n");
  const script = join(cwd, "node_modules/@supabase/supabase-js");
  mkdirSync(script, { recursive: true });
  writeFileSync(join(script, "index.js"), `
    exports.createClient = (url, key) => {
      require("node:fs").writeFileSync("supabase-client-created", "");
      if (url !== ${JSON.stringify(loopback)} || key !== ${JSON.stringify(serviceKey)}) throw new Error("wrong fixture settings");
      return { from: () => ({ select: () => ({ eq: () => ({
        single: async () => ({ data: { id: "test", title: "Fixture", code: "02-180" } }),
        order: async () => ({ data: [] }),
      }) }) }) };
    };
  `);

  return {
    cwd,
    write: (file, contents) => writeFileSync(join(cwd, file), contents),
    run: (...args) => spawnSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        NEXT_PUBLIC_SUPABASE_URL: production,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-shell-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "dummy-shell-service-key",
        ANTHROPIC_API_KEY: "dummy-shell-anthropic-key",
        COGNITERRA_LAUNCH_URL: production,
        NEXT_PUBLIC_UNCONFIGURED: "dummy-shell-public-value",
        GOOGLE_API_KEY: "dummy-shell-google-key",
        NEXT_PRIVATE_DEV_DIR: "/another-app",
        PROFILE_REFERENCE: "dummy-shell-expansion",
        NODE_ENV: "production",
      },
    }),
  };
}

test("parses profile flags while preserving Next flags", () => {
  assert.deepEqual(parseProfileArgs([]), { envFile: ".env.dev", args: [] });
  assert.deepEqual(parseProfileArgs(["--webpack", "--env-file", ".env.dev.personal", "--port", "3001"]), {
    envFile: ".env.dev.personal",
    args: ["--webpack", "--port", "3001"],
  });
  assert.throws(() => parseProfileArgs(["--env-file=.env.dev", "--env-file=.env.dev.personal"]), /only once/);
  assert.throws(() => parseProfileArgs(["--env-file"]), /Choose/);
});

test("the classifier accepts loopback and rejects unapproved or malformed origins", () => {
  for (const origin of [loopback, "http://localhost:54321", "http://[::1]:54321"]) {
    assert.deepEqual(classifySupabaseTarget(`${origin}/`), { kind: "loopback", origin });
  }
  for (const url of [production, "http://192.168.1.1", "http://localhost.example.invalid", "https://example.invalid"]) {
    assert.throws(() => classifySupabaseTarget(url), /approved HTTPS development origin/);
  }
  for (const url of ["postgres://localhost", "https://dummy-secret@localhost", "http://localhost/rest/v1", "http://localhost?", "http://localhost#"]) {
    assert.throws(() => classifySupabaseTarget(url), /^Error: NEXT_PUBLIC_SUPABASE_URL must be an HTTP\(S\) origin\.$/);
  }
});

test("hosted origins must match exactly and use the corresponding profile", async (t) => {
  const { cwd, write, run } = fixture(t);
  write("scripts/dev-targets.mjs", `export const hostedDevOrigins = { shared: ["${shared}"], personal: ["${personal}"] };`);
  const { loadDevProfile } = await import(pathToFileURL(join(cwd, "scripts/dev-profile.mjs")));
  write(".env.dev", selectedValues(shared));
  write(".env.dev.personal", selectedValues(personal));
  assert.deepEqual(loadDevProfile().target, { kind: "shared", origin: shared });
  assert.deepEqual(loadDevProfile({ envFile: ".env.dev.personal" }).target, { kind: "personal", origin: personal });

  write(".env.dev", selectedValues(personal));
  const wrongProfile = run("scripts/dev.mjs");
  assert.equal(wrongProfile.status, 1);
  assert.match(wrongProfile.stderr, /must use a shared development origin or loopback/);
  assert.equal(wrongProfile.stdout, "");

  for (const url of [shared.replace("https:", "http:"), shared.replace(".invalid", ".invalid.evil.invalid"), `${shared}:8443`, production]) {
    write(".env.dev", selectedValues(url));
    const result = run("scripts/dev.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /approved HTTPS development origin/);
    assert.equal(result.stdout, "");
  }
});

test("the launcher selects one profile and passes only its app settings to Next", (t) => {
  const { cwd, write, run } = fixture(t);
  write(".env.dev", selectedValues(loopback));
  write(".env.dev.personal", selectedValues("http://[::1]:54322"));

  const defaultRun = run("scripts/dev.mjs");
  assert.equal(defaultRun.status, 0, defaultRun.stderr);
  assert.equal(JSON.parse(defaultRun.stdout).env.NEXT_PUBLIC_SUPABASE_URL, loopback);

  const result = run("scripts/dev.mjs", "--env-file=.env.dev.personal", "--port", "3001", "--webpack");
  assert.equal(result.status, 0, result.stderr);
  const { args, env } = JSON.parse(result.stdout);
  assert.deepEqual(args, ["dev", `${cwd}${sep}`, "--port", "3001", "--webpack"]);
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "http://[::1]:54322");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, anonKey);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, serviceKey);
  assert.equal(env.GOOGLE_API_KEY, "dummy$PROFILE_REFERENCE");
  for (const key of ["ANTHROPIC_API_KEY", "COGNITERRA_LAUNCH_URL", "NEXT_PUBLIC_UNCONFIGURED", "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "NEXT_PRIVATE_DEV_DIR"]) {
    assert.equal(env[key], undefined, key);
  }
});

test("all Next development fallbacks fail before Next can start", (t) => {
  const { cwd, write, run } = fixture(t);
  write(".env.dev", selectedValues(loopback));
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    write(file, selectedValues(production));
    const result = run("scripts/dev.mjs");
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(file));
    assert.match(result.stderr, /Move development settings into .env.dev/);
    assert.equal(result.stdout, "");
    rmSync(join(cwd, file));
  }

  if (process.platform !== "win32") {
    symlinkSync("missing-env-file", join(cwd, ".env.local"));
    assert.match(run("scripts/dev.mjs").stderr, /fallback files.*\.env\.local/);
  }
});

test("Next requires both keys and rejects a private key in the public field", (t) => {
  const { write, run } = fixture(t);
  write(".env.dev", `NEXT_PUBLIC_SUPABASE_URL=${loopback}\n`);
  const missing = run("scripts/dev.mjs");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing required settings: NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(missing.stdout, "");

  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  for (const privateKey of [serviceKey, "sb_secret_dummy", `a.${payload}.b`]) {
    write(".env.dev", selectedValues(loopback).replace(anonKey, privateKey));
    const result = run("scripts/dev.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must contain an anon or publishable key/);
    assert.ok(!result.stderr.includes(privateKey));
    assert.equal(result.stdout, "");
  }
});

test("scratch rejects unsafe targets and missing service keys before constructing a client", (t) => {
  const { cwd, write, run } = fixture(t);
  const marker = join(cwd, "supabase-client-created");
  write(".env.dev.personal", selectedValues(production));
  const productionRun = run("scratch-inspect-course.mjs", "--env-file", ".env.dev.personal", "02-180");
  assert.equal(productionRun.status, 1);
  assert.match(productionRun.stderr, /approved HTTPS development origin/);
  assert.ok(!productionRun.stderr.includes(production));
  assert.ok(!existsSync(marker));

  write(".env.dev", `NEXT_PUBLIC_SUPABASE_URL=${loopback}\n`);
  const missingKey = run("scratch-inspect-course.mjs");
  assert.equal(missingKey.status, 1);
  assert.match(missingKey.stderr, /missing required settings: SUPABASE_SERVICE_ROLE_KEY/);
  assert.ok(!existsSync(marker));

  write(".env.dev.personal", `NEXT_PUBLIC_SUPABASE_URL=${loopback}\nSUPABASE_SERVICE_ROLE_KEY=${serviceKey}\n`);
  const invalidCutoff = run("scratch-inspect-course.mjs", "--env-file", ".env.dev.personal", "02-180", "--delete-from-position", "NaN");
  assert.equal(invalidCutoff.status, 1);
  assert.match(invalidCutoff.stderr, /nonnegative integer/);
  assert.ok(!existsSync(marker));

  const inspected = run("scratch-inspect-course.mjs", "--env-file", ".env.dev.personal", "02-180");
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.match(inspected.stdout, /Course: Fixture \(02-180\)/);
  assert.ok(existsSync(marker));
});
