import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DIGEST, MIGRATION, externalUrl, fail, fields, jsonBytes, mediaFilename, pin, sha256, verifyContent } from "./content.mjs";

const workspace = fileURLToPath(new URL("../../", import.meta.url));
const JSON_LIMIT = 16 * 1024 * 1024;
export const MEDIA_LIMIT = 50 * 1024 * 1024;
const TOTAL_MEDIA_LIMIT = 256 * 1024 * 1024;

function checkMediaType(bytes, type) {
  const start = (value, offset = 0) => bytes.subarray(offset, offset + value.length).toString("latin1") === value;
  const matches = {
    "image/png": () => start("\x89PNG\r\n\x1a\n"),
    "image/jpeg": () => start("\xff\xd8\xff"),
    "image/gif": () => start("GIF87a") || start("GIF89a"),
    "image/webp": () => start("RIFF") && start("WEBP", 8),
    "application/pdf": () => start("%PDF-"),
    "video/mp4": () => start("ftyp", 4),
    "video/webm": () => start("\x1a\x45\xdf\xa3"),
    "audio/mpeg": () => start("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
    "audio/wav": () => start("RIFF") && start("WAVE", 8),
    "text/plain": () => {
      try { return !new TextDecoder("utf-8", { fatal: true }).decode(bytes).includes("\0"); }
      catch { return false; }
    },
  };
  if (!Object.hasOwn(matches, type) || !matches[type]()) fail("Media bytes do not match the declared type");
}

export async function privateDirectory(path, newDirectory = false) {
  if (!isAbsolute(path ?? "")) fail("Use an absolute directory outside the repository");
  if (newDirectory) {
    const parent = await privateDirectory(join(path, ".."));
    path = join(parent, relative(join(path, ".."), path));
  } else {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.mode & 0o007) fail("Use a private directory with no access for others");
    path = await realpath(path);
  }
  const rel = relative(await realpath(workspace), path);
  if (rel !== ".." && !rel.startsWith("../")) fail("Keep course data outside the repository");
  return path;
}

async function readFile(path, limit) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit || stat.mode & 0o007) fail("Invalid private bundle file or size");
    const bytes = await handle.readFile();
    if (bytes.length !== stat.size) fail("Bundle file changed during validation");
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseJson(bytes) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("Invalid UTF-8 JSON in bundle"); }
}

function validateManifest(manifest, identifier) {
  const { course, version } = pin(identifier);
  fields(manifest, {
    format: (value) => value === 1,
    course: (value) => value === course,
    version: (value) => value === version,
    requiredMigration: (value) => value === MIGRATION,
    contentSha256: (value) => typeof value === "string" && DIGEST.test(value),
    media: Array.isArray,
    externalUrls: Array.isArray,
  }, "manifest");
  let total = 0;
  let previous = "";
  for (const item of manifest.media) {
    fields(item, {
      sha256: (value) => typeof value === "string" && DIGEST.test(value),
      size: (value) => Number.isSafeInteger(value) && value > 0 && value <= MEDIA_LIMIT,
      type: (value) => typeof value === "string",
      file: (value) => typeof value === "string",
    }, "media entry");
    if (item.sha256 <= previous || item.file !== mediaFilename(item.sha256, item.type)) fail("Invalid or duplicate media file");
    previous = item.sha256;
    total += item.size;
    if (total > TOTAL_MEDIA_LIMIT) fail("Course bundle exceeds the aggregate media limit");
  }
  previous = "";
  for (const url of manifest.externalUrls) {
    if (typeof url !== "string" || url <= previous || externalUrl(url) !== url) fail("Invalid external link inventory");
    previous = url;
  }
}

export async function readBundle(path, identifier, expectedDigest) {
  const dir = await privateDirectory(path);
  const manifestBytes = await readFile(join(dir, "manifest.json"), JSON_LIMIT);
  const digest = sha256(manifestBytes);
  if (expectedDigest && digest !== expectedDigest) fail("Bundle manifest differs from the approved SHA-256");
  const manifest = parseJson(manifestBytes);
  validateManifest(manifest, identifier);
  const entries = (await readdir(dir)).sort();
  const expected = ["content.json", "manifest.json", ...manifest.media.map((item) => item.file)].sort();
  if (entries.length !== expected.length || entries.some((entry, i) => entry !== expected[i])) fail("Unexpected or missing bundle files");
  const contentBytes = await readFile(join(dir, "content.json"), JSON_LIMIT);
  if (sha256(contentBytes) !== manifest.contentSha256) fail("Bundle content checksum mismatch");
  const graph = parseJson(contentBytes);
  verifyContent(manifest, graph);
  const media = new Map();
  for (const item of manifest.media) {
    const bytes = await readFile(join(dir, item.file), item.size);
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) fail("Bundle media checksum mismatch");
    checkMediaType(bytes, item.type);
    media.set(item.file, bytes);
  }
  return { manifest, graph, digest, manifestBytes, contentBytes, media };
}

export function createBundle(identifier, graph, entries, externalUrls) {
  const { course, version } = pin(identifier);
  const contentBytes = jsonBytes(graph);
  const media = entries.map(({ bytes, type }) => {
    checkMediaType(bytes, type);
    const digest = sha256(bytes);
    return { sha256: digest, size: bytes.length, type, file: mediaFilename(digest, type), bytes };
  }).sort((left, right) => left.sha256.localeCompare(right.sha256));
  const manifest = {
    format: 1, course, version, requiredMigration: MIGRATION,
    contentSha256: sha256(contentBytes),
    media: media.map(({ sha256, size, type, file }) => ({ sha256, size, type, file })),
    externalUrls: [...externalUrls].sort(),
  };
  const manifestBytes = jsonBytes(manifest);
  if (contentBytes.length > JSON_LIMIT || manifestBytes.length > JSON_LIMIT) fail("Bundle JSON exceeds the size limit");
  validateManifest(manifest, identifier);
  verifyContent(manifest, graph);
  return {
    manifest, graph, digest: sha256(manifestBytes), manifestBytes, contentBytes,
    media: new Map(media.map(({ file, bytes }) => [file, bytes])),
  };
}

export async function writeBundle(path, bundle, { sealed = false } = {}) {
  const dir = await privateDirectory(path, true);
  // An exclusive directory creation reserves the pin. The manifest is written
  // last so concurrent readers either see a complete bundle or fail closed.
  await mkdir(dir, { mode: 0o700 });
  try {
    const mode = sealed ? 0o400 : 0o600;
    for (const [file, bytes] of bundle.media) {
      await writeFile(join(dir, file), bytes, { flag: "wx", mode });
    }
    await writeFile(join(dir, "content.json"), bundle.contentBytes, { flag: "wx", mode });
    await writeFile(join(dir, "manifest.json"), bundle.manifestBytes, { flag: "wx", mode });
    if (sealed) await chmod(dir, 0o500);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function registryVersion(root, identifier, createCourse = false) {
  const { course, version } = pin(identifier);
  const courseDir = join(await privateDirectory(root), course);
  if (createCourse) {
    try { await mkdir(courseDir, { mode: 0o700 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  return join(await privateDirectory(courseDir), version);
}
