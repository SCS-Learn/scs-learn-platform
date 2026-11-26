import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { classifySupabaseTarget } from "../dev-profile.mjs";
import { DESTINATION_MIGRATION, MIGRATION, jsonBytes, preparePublication, sha256, verifyContent } from "./content.mjs";
import { readBundle, registryVersion, writeBundle } from "./files.mjs";
import { api, exportCourse, publishCourse, selectDeveloperDestination, selectMaintainerDestination } from "./supabase.mjs";
import { fixturePin, syntheticBundle } from "./synthetic.mjs";

const run = promisify(execFile);
const origin = "http://127.0.0.1:54321";
const marker = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function sandbox(t) {
  const path = await mkdtemp(join(tmpdir(), "course-bundle-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("fixture, explicit approvals, sealed registry and exact developer pull", async (t) => {
  const root = await sandbox(t);
  const stage = join(root, "stage");
  const work = join(root, "pulled");
  const synthetic = await run(process.execPath, ["scripts/course-bundles/synthetic.mjs", stage]);
  const { sha256: digest } = JSON.parse(synthetic.stdout);
  const approve = ["scripts/maintain-course-bundle.mjs", "approve", fixturePin,
    "--staging", stage, "--registry", root, "--sha256", digest];
  await assert.rejects(run(process.execPath, [...approve, "--content-reviewed"]), /Confirm the content, media and privacy reviews/);
  approve.push("--content-reviewed", "--privacy-reviewed", "--media-reviewed");
  await run(process.execPath, approve);
  await assert.rejects(run(process.execPath, approve), /EEXIST/);
  const sealed = await registryVersion(root, fixturePin);
  assert.equal((await readBundle(sealed, fixturePin, digest)).digest, digest);
  const pull = ["scripts/course-bundle.mjs", "pull", fixturePin, "--registry", root, "--out", work, "--sha256", digest];
  assert.equal(JSON.parse((await run(process.execPath, pull)).stdout).sha256, digest);
  assert.equal((await readBundle(work, fixturePin, digest)).digest, digest);
  // Clean up read-only directories even for unprivileged test users.
  await chmod(work, 0o700);
  await chmod(sealed, 0o700);
});

test("tampered manifest, payload, schema, references and media fail validation", async (t) => {
  const root = await sandbox(t);
  const path = join(root, "bundle");
  const bundle = syntheticBundle();
  await writeBundle(path, bundle);
  await assert.rejects(readBundle(path, fixturePin, "0".repeat(64)), /approved SHA-256/);
  const manifest = join(path, "manifest.json");
  await writeFile(manifest, jsonBytes({ ...bundle.manifest, requiredMigration: "101" }));
  await assert.rejects(readBundle(path, fixturePin), /requiredMigration/);
  await writeFile(manifest, bundle.manifestBytes);
  const content = join(path, "content.json");
  await writeFile(content, "tampered");
  await assert.rejects(readBundle(path, fixturePin), /content checksum/);
  await writeFile(content, bundle.contentBytes);
  await writeFile(join(path, bundle.manifest.media[0].file), Buffer.alloc(bundle.manifest.media[0].size));
  await assert.rejects(readBundle(path, fixturePin), /media checksum/);

  const graph = structuredClone(bundle.graph);
  graph.question_groups[0].lesson_id = "l1";
  assert.throws(() => verifyContent(bundle.manifest, graph), /another lesson/);
  graph.question_groups[0].lesson_id = "l2";
  graph.questions[0].platform_user_id = "synthetic";
  assert.throws(() => verifyContent(bundle.manifest, graph), /Invalid questions fields/);
  delete graph.questions[0].platform_user_id;
  graph.lessons[0].content_html += '<img src="bundle-media:' + "0".repeat(64) + '"/>';
  assert.throws(() => verifyContent(bundle.manifest, graph), /missing media/);
});

test("export is allowlisted, uses read-only requests and rewrites all bundled references", async () => {
  const source = "https://content-src.supabase.co";
  const bundle = syntheticBundle();
  const { content } = preparePublication(bundle, source);
  const [item] = bundle.manifest.media;
  content.lessons[0].content_html = `<picture><source srcset="${content.attachments[0].url} 1x"><img src="${content.attachments[0].url}"></picture>`;
  content.lesson_blocks[0].body_html = `<p>References: <a href="https://example.org/reference">Example</a></p>`;
  const calls = [];
  const client = api({ origin: source, key: "sb_publishable_test", exportToken: "1".repeat(64) }, async (url, options) => {
    calls.push({ url, ...options });
    if (url.includes("/rpc/")) return Response.json(content);
    return new Response(bundle.media.get(item.file), { headers: { "content-type": "image/png" } });
  });
  await assert.rejects(exportCourse(client, source, fixturePin, "BUNDLE_SMOKE"), /export allowlist/);
  assert.equal(calls.length, 0);
  const staged = await exportCourse(client, source, fixturePin, "BUNDLE_SMOKE", { [source]: ["BUNDLE_SMOKE"] });
  assert.deepEqual(staged.manifest.externalUrls, ["https://example.org/reference"]);
  assert.equal(staged.manifest.media.length, 1);
  assert.equal(staged.graph.attachments[0].url, `bundle-media:${item.sha256}`);
  assert.match(staged.graph.lessons[0].content_html, new RegExp(`srcset="bundle-media:${item.sha256} 1x`));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.method === undefined && call.redirect === "error"));
  assert.equal(calls[0].headers["x-course-bundle-export"], "1".repeat(64));
  assert.deepEqual(calls[1].headers, {});
  assert.doesNotMatch(staged.contentBytes.toString(), /content-src\.supabase\.co|storage_path/);

  content.lessons[0].content_html = '<img src="https://content-src.supabase.co/storage/v1/object/sign/lesson-media/demo.png?token=private">';
  await assert.rejects(exportCourse(client, source, fixturePin, "BUNDLE_SMOKE", { [source]: ["BUNDLE_SMOKE"] }), /Only unsigned Storage/);
  assert.equal(calls.length, 3);
});

test("guarded destination rejects unknown, production and shared profiles before network IO", async () => {
  const remote = "https://production.supabase.co";
  assert.throws(() => classifySupabaseTarget(remote), /approved HTTPS development origin/);
  assert.throws(() => selectDeveloperDestination({ kind: "shared", origin: remote }, marker), /loopback or approved personal/);
  assert.throws(() => selectMaintainerDestination(remote), /approved isolated/);
  assert.throws(() => selectMaintainerDestination(remote, { [remote]: { environment: "production", id: marker } }), /approved isolated/);
  const destination = selectDeveloperDestination(classifySupabaseTarget(origin), marker);
  const bundle = syntheticBundle();
  const calls = [];
  const client = api({ origin, key: "test" }, async (url) => {
    calls.push(url);
    return Response.json({ destination: "wrong" });
  });
  await assert.rejects(publishCourse(client, destination, bundle), /Destination identity/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /course_bundle_target/);
});

test("validate DB before upload, verify anonymous Storage bytes, publish without upsert", async () => {
  const bundle = syntheticBundle();
  const destination = selectDeveloperDestination(classifySupabaseTarget(origin), marker);
  const [item] = bundle.manifest.media;
  const uploaded = bundle.media.get(item.file);
  const calls = [];
  let installed = false;
  const client = api({ origin, key: "test" }, async (url, options) => {
    calls.push({ url, ...options });
    if (url.includes("course_bundle_target")) {
      return Response.json({ migration: DESTINATION_MIGRATION, bucket: "lesson-media", destination: marker });
    }
    if (url.includes("course_bundle_publish")) {
      const { p_dry_run: dryRun, p_content: content } = JSON.parse(options.body);
      assert.equal(content.attachments[0].storage_path, `course-bundles/BUNDLE_SMOKE/v1/${item.file}`);
      assert.match(content.lessons[0].content_html, /\/storage\/v1\/object\/public\/lesson-media\/course-bundles\//);
      if (!dryRun) installed = true;
      return Response.json({ state: installed ? "installed" : "ready" });
    }
    if (options.method === "POST") {
      assert.equal(options.headers["x-upsert"], "false");
      assert.equal(sha256(options.body), item.sha256);
      return Response.json({});
    }
    assert.deepEqual(options.headers, {});
    return new Response(uploaded, { headers: { "content-type": item.type } });
  });
  await publishCourse(client, destination, bundle);
  assert.deepEqual(calls.map((call) => call.method ?? "GET"), ["GET", "POST", "POST", "GET", "POST"]);
  const firstSize = calls.length;
  await publishCourse(client, destination, bundle);
  assert.deepEqual(calls.slice(firstSize).map((call) => call.method ?? "GET"), ["GET", "POST", "GET"]);

  const rejectCalls = [];
  const rejects = api({ origin, key: "test" }, async (url) => {
    rejectCalls.push(url);
    if (url.includes("course_bundle_target")) {
      return Response.json({ migration: DESTINATION_MIGRATION, bucket: "lesson-media", destination: marker });
    }
    return Response.json({ message: "bundle_unmanaged_course_collision" }, { status: 400 });
  });
  await assert.rejects(publishCourse(rejects, destination, bundle), /bundle_unmanaged_course_collision/);
  assert.equal(rejectCalls.length, 2);
});

test("prose and linked media are blocked when identities, credentials or active content are present", () => {
  const { manifest, graph } = syntheticBundle();
  for (const [html, expected] of [
    ["<p>learner@example.org</p>", /Potential identity/],
    ['<img src="data:image/png;base64,ZmFrZQ==">', /External link/],
    ['<p style="background:url(https://example.org/track)">test</p>', /Unsupported active attribute/],
    ['<iframe srcdoc="<script>bad</script>"></iframe>', /Unsupported active attribute/],
    ['<a href="https://example.org/download?token=secret">x</a>', /External link/],
  ]) {
    const fixture = structuredClone(graph);
    fixture.lessons[0].content_html = html;
    assert.throws(() => verifyContent(manifest, fixture), expected);
  }
});

test("smoke fixture generations are separate courses and v1 stays byte-identical", async (t) => {
  const first = syntheticBundle();
  assert.equal(first.manifest.course, "BUNDLE_SMOKE");
  assert.equal(first.graph.course.title, "Synthetic Bundle Smoke");
  // The approved BUNDLE_SMOKE@v1 digest must not drift with tooling changes.
  assert.equal(first.digest, "a9a37d28120f660f7d153c810c1b5314f089c8f08451228c2b0736197a51e78c");
  const second = syntheticBundle("BUNDLE_SMOKE_2@v1");
  assert.equal(second.manifest.course, "BUNDLE_SMOKE_2");
  assert.equal(second.graph.course.code, "BUNDLE_SMOKE_2");
  assert.equal(second.graph.course.title, "Synthetic Bundle Smoke 2");
  assert.deepEqual(second.graph.lessons.map((lesson) => lesson.code), ["TOPIC", "ASSESSMENT"]);
  assert.equal(second.manifest.requiredMigration, MIGRATION);
  const origin = "https://staging-ref.supabase.co";
  const rowIds = (bundle) => {
    const { content } = preparePublication(bundle, origin);
    return Object.entries(content).filter(([name]) => name !== "course").flatMap(([, rows]) => rows.map((row) => row.id));
  };
  const firstIds = new Set(rowIds(first));
  assert.equal(firstIds.size, 7);
  assert.ok(rowIds(second).every((id) => id && !firstIds.has(id)));
  for (const identifier of ["BUNDLE_SMOKE_1@v1", "BUNDLE_SMOKE_02@v1", "OTHER@v1", "BUNDLE_SMOKE_2"]) {
    assert.throws(() => syntheticBundle(identifier), /BUNDLE_SMOKE|course@version/);
  }
  const root = await sandbox(t);
  const out = join(root, "stage");
  const generated = await run(process.execPath, ["scripts/course-bundles/synthetic.mjs", out, "BUNDLE_SMOKE_2@v1"]);
  assert.equal(JSON.parse(generated.stdout).sha256, second.digest);
  assert.equal((await readBundle(out, "BUNDLE_SMOKE_2@v1", second.digest)).manifest.course, "BUNDLE_SMOKE_2");
});

test("destination without the replacement guards and guarded refusals are explicit", async () => {
  const bundle = syntheticBundle();
  const destination = selectDeveloperDestination(classifySupabaseTarget(origin), marker);
  const older = api({ origin, key: "test" }, async () =>
    Response.json({ migration: MIGRATION, bucket: "lesson-media", destination: marker }));
  await assert.rejects(publishCourse(older, destination, bundle), /required migration/);
  for (const [code, hint] of [
    ["bundle_replacement_has_activity_or_external_references", /new course code/],
    ["bundle_published_content_changed", /Nothing was replaced/],
    ["bundle_destination_busy", /Nothing changed; retry later/],
  ]) {
    const calls = [];
    const client = api({ origin, key: "test" }, async (url) => {
      calls.push(url);
      if (url.includes("course_bundle_target")) {
        return Response.json({ migration: DESTINATION_MIGRATION, bucket: "lesson-media", destination: marker });
      }
      return Response.json({ message: code }, { status: 400 });
    });
    const error = await publishCourse(client, destination, bundle, "v0").catch((caught) => caught);
    assert.match(error.message, new RegExp(`\\(${code}\\)`));
    assert.match(error.message, hint);
    // A refused dry run uploads nothing.
    assert.equal(calls.length, 2);
  }
});
