import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { BUCKET, DESTINATION_MIGRATION, UUID, externalUrl, fail, mediaFilename, mediaPath, portableGraph, preparePublication, publicUrl, rewriteContent, sha256, validateGraph } from "./content.mjs";
import { createBundle, MEDIA_LIMIT } from "./files.mjs";
import { approvedDestinations, approvedSources } from "./maintainer-policy.mjs";

const API_LIMIT = 16 * 1024 * 1024;
const API_URL = "NEXT_PUBLIC_SUPABASE_URL";
const SERVICE_KEY = "SUPABASE_SERVICE_ROLE_KEY";

export async function readMaintainerProfile(path, operation) {
  if (!path) fail("Provide an explicit maintainer --env-file");
  const values = parseEnv(await readFile(path, "utf8"));
  const exporting = operation === "export";
  const keyName = exporting ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : SERVICE_KEY;
  if (!values[keyName]) fail(`Maintainer profile is missing ${keyName}`);
  const key = values[keyName];
  const result = { origin: hostedOrigin(values[API_URL]), key };
  if (!exporting) return result;
  let isAnon = key.startsWith("sb_publishable_");
  if (!isAnon) {
    try { isAnon = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role === "anon"; } catch { /* Invalid key. */ }
  }
  const exportToken = values.COURSE_BUNDLE_EXPORT_TOKEN;
  if (!isAnon || !/^[a-f0-9]{64}$/.test(exportToken ?? "")) fail("Export requires an anon API key and a 64-character hex course export token");
  return { ...result, exportToken };
}

function hostedOrigin(value) {
  let url;
  try { url = new URL(value); } catch { fail("Missing or invalid maintainer Supabase origin"); }
  if (url.protocol !== "https:" || value.replace(/\/$/, "") !== url.origin || url.port || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) {
    fail("Expected the exact HTTPS origin of an approved Supabase project");
  }
  return url.origin;
}

export function selectMaintainerDestination(origin, policy = approvedDestinations) {
  const entry = Object.hasOwn(policy, origin) && policy[origin];
  if (!entry || !["shared-dev", "staging"].includes(entry.environment) || !UUID.test(entry.id)) {
    fail("Maintainer destination must be an approved isolated shared-dev or staging project");
  }
  return { ...entry, origin };
}

export function selectDeveloperDestination(target, id) {
  if (!["loopback", "personal"].includes(target.kind)) fail("Use a loopback or approved personal development profile");
  if (!UUID.test(id ?? "")) fail("Provide the provisioned developer --destination UUID");
  return { environment: target.kind === "loopback" ? "local" : "personal", origin: target.origin, id };
}

export const maintainerDestinationKey = SERVICE_KEY;

// Operator guidance for refusals that leave the active version in place.
export const errorHints = Object.freeze({
  bundle_destination_busy: "Another publication or learner write held a lock for 5 seconds. Nothing changed; retry later",
  bundle_published_content_changed: "The installed course differs from its pinned graph. Nothing was replaced; investigate the change",
  bundle_ownership_changed: "Rows were added to or removed from the installed course. Nothing was replaced; investigate the change",
  bundle_replacement_has_activity_or_external_references:
    "The active version has learner progress or links. Keep it and publish the update under a new course code",
  bundle_managed_content_read_only: "Bundle-managed content changes only through a new bundle version",
});

async function boundedBody(response, limit) {
  if (!response.body) fail("Supabase returned an empty response");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, total);
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      fail("Supabase response exceeds the configured size limit");
    }
    chunks.push(value);
  }
}

export function api({ origin, key, exportToken }, request = fetch) {
  const auth = { apikey: key, ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }) };
  function send(path, options = {}, authenticated = true) {
    return request(`${origin}${path}`, {
      ...options,
      headers: { ...(authenticated ? auth : {}), ...options.headers },
      redirect: "error",
      signal: AbortSignal.timeout(90_000),
    });
  }
  async function rpc(name, args, get = false) {
    const path = `/rest/v1/rpc/${name}`;
    const response = get
      ? await send(`${path}?${new URLSearchParams(args)}`, {
        headers: name === "course_bundle_export" ? { "x-course-bundle-export": exportToken } : {},
      })
      : await send(path, { method: "POST", body: JSON.stringify(args), headers: { "Content-Type": "application/json" } });
    const bytes = await boundedBody(response, response.ok ? API_LIMIT : 16_384);
    if (!response.ok) {
      const code = bytes.toString().match(/"message"\s*:\s*"(bundle_[a-z_]+)"/)?.[1];
      const hint = Object.hasOwn(errorHints, code ?? "") ? `. ${errorHints[code]}` : "";
      fail(`Supabase ${name} failed (${code ?? `HTTP ${response.status}`})${hint}`);
    }
    return JSON.parse(bytes.toString());
  }
  async function sourceMedia(path) {
    const response = await send(publicUrl(origin, path).slice(origin.length), {}, false);
    if (!response.ok) fail(`Source media download failed (HTTP ${response.status})`);
    const bytes = await boundedBody(response, MEDIA_LIMIT);
    const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    mediaFilename(sha256(bytes), type);
    return { bytes, type };
  }
  async function verifyUploaded(path, item) {
    const endpoint = publicUrl(origin, path).slice(origin.length);
    const response = await send(endpoint, {}, false);
    const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!response.ok || type !== item.type) {
      await response.body?.cancel();
      fail("Public Storage object missing or has an unexpected MIME type");
    }
    const downloaded = await boundedBody(response, item.size);
    if (sha256(downloaded) !== item.sha256) fail("Public Storage object differs from its immutable bundle media");
  }
  async function upload(path, bytes, item) {
    const endpoint = `/storage/v1/object/${BUCKET}/${path}`;
    const response = await send(endpoint, {
      method: "POST",
      headers: { "Content-Type": item.type, "x-upsert": "false" },
      body: bytes,
    });
    await response.body?.cancel();
    if (!response.ok && ![400, 409].includes(response.status)) fail(`Media upload failed (HTTP ${response.status})`);
    await verifyUploaded(path, item);
  }
  return { rpc, sourceMedia, upload, verifyUploaded };
}

function sourcePath(value, origin) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!url.pathname.startsWith("/storage/v1/")) return null;
  if (url.origin !== origin || url.username || url.password || url.search || url.hash) fail("Only unsigned Storage media on the approved source can be copied");
  const prefix = `/storage/v1/object/public/${BUCKET}/`;
  if (!url.pathname.startsWith(prefix)) fail("Unsupported source Storage media location");
  const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent);
  if (path.some((part) => !part || /^\.{1,2}$/.test(part) || /[\/\\\x00-\x1f]/.test(part))) fail("Invalid source Storage media path");
  return path.join("/");
}

export async function exportCourse(client, origin, identifier, course, policy = approvedSources) {
  if (!Object.hasOwn(policy, origin) || !policy[origin].includes(course)) fail("Course is absent from the maintainer export allowlist for this source");
  const source = await client.rpc("course_bundle_export", { p_code: course }, true);
  if (!source?.course || source.course.code !== course) fail("Allowlisted source course was not found");
  const graph = portableGraph(source);
  validateGraph(graph, course);
  const paths = new Map();
  const external = new Set();
  for (const attachment of source.attachments) {
    if (attachment.storage_path && attachment.storage_path !== sourcePath(attachment.url, origin)) fail("Attachment URL and source Storage path disagree");
  }
  function discover(value) {
    const path = sourcePath(value, origin);
    if (path === null) external.add(externalUrl(value));
    else paths.set(path, null);
    return value;
  }
  rewriteContent(graph, discover, (attachment) => attachment);
  const bytesByDigest = new Map();
  let total = 0;
  for (const path of paths.keys()) {
    const entry = await client.sourceMedia(path);
    const digest = sha256(entry.bytes);
    paths.set(path, digest);
    if (bytesByDigest.has(digest) && bytesByDigest.get(digest).type !== entry.type) fail("Identical media has conflicting MIME types");
    if (!bytesByDigest.has(digest)) total += entry.bytes.length;
    if (total > 256 * 1024 * 1024) fail("Course bundle exceeds the aggregate media limit");
    bytesByDigest.set(digest, entry);
  }
  function portableUrl(value) {
    const path = sourcePath(value, origin);
    return path === null ? externalUrl(value) : `bundle-media:${paths.get(path)}`;
  }
  const portable = rewriteContent(graph, portableUrl, (attachment) => {
    if (!attachment.url?.startsWith("bundle-media:")) return attachment;
    const entry = bytesByDigest.get(attachment.url.slice("bundle-media:".length));
    return { ...attachment, content_type: entry.type, size_bytes: entry.bytes.length };
  });
  return createBundle(identifier, portable, [...bytesByDigest.values()], external);
}

export async function verifyDestination(client, destination) {
  const args = {
    p_environment: destination.environment, p_origin: destination.origin, p_destination: destination.id,
  };
  const result = await client.rpc("course_bundle_target", args, true);
  if (result?.migration !== DESTINATION_MIGRATION || result?.bucket !== BUCKET || result?.destination !== destination.id) {
    fail("Destination identity, public media bucket or required migration could not be verified");
  }
  return args;
}

export async function publishCourse(client, destination, bundle, replace) {
  const target = await verifyDestination(client, destination);
  const { manifest, digest, media } = bundle;
  const { content, paths } = preparePublication(bundle, destination.origin);
  const args = {
    ...target, p_code: manifest.course, p_version: manifest.version, p_digest: digest,
    p_content: content, p_media: paths, p_replace: replace ?? null,
  };
  const preview = await client.rpc("course_bundle_publish", { ...args, p_dry_run: true });
  if (preview?.state === "installed") {
    for (const item of manifest.media) await client.verifyUploaded(mediaPath(manifest, item.file), item);
    return preview;
  }
  if (preview?.state !== "ready") fail("Destination did not validate the publication");
  for (const item of manifest.media) {
    await client.upload(mediaPath(manifest, item.file), media.get(item.file), item);
  }
  const result = await client.rpc("course_bundle_publish", { ...args, p_dry_run: false });
  if (result?.state !== "installed") fail("Destination did not confirm publication");
  return result;
}

export async function installedCourse(client, destination, { course, version }, digest) {
  const target = await verifyDestination(client, destination);
  const result = await client.rpc("course_bundle_status", { ...target, p_code: course, p_version: version, p_digest: digest }, true);
  if (result?.state !== "installed") fail("The requested bundle pin is not installed");
  return result;
}
