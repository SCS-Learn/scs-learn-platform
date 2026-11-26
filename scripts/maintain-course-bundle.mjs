import { invocation, report, reportError } from "./course-bundles/cli.mjs";
import { fail } from "./course-bundles/content.mjs";
import { privateDirectory, readBundle, registryVersion, writeBundle } from "./course-bundles/files.mjs";
import { api, exportCourse, installedCourse, publishCourse, readMaintainerProfile, selectMaintainerDestination } from "./course-bundles/supabase.mjs";

async function main() {
  const { command, identifier, pinned, digest, values } = invocation(process.argv.slice(2), {
    export: ["env-file", "out"],
    approve: ["staging", "registry", "sha256", "content-reviewed", "media-reviewed", "privacy-reviewed"],
    publish: ["registry", "sha256", "env-file", "replace"],
    status: ["sha256", "env-file"],
  });
  if (command === "export") {
    const source = await readMaintainerProfile(values["env-file"], "export");
    await privateDirectory(values.out, true);
    const bundle = await exportCourse(api(source), source.origin, identifier, pinned.course);
    await writeBundle(values.out, bundle);
    report({ ...bundle.manifest, sha256: bundle.digest });
    return;
  }
  if (command === "approve") {
    if (!values["content-reviewed"] || !values["media-reviewed"] || !values["privacy-reviewed"]) {
      fail("Confirm the content, media and privacy reviews of this exact manifest");
    }
    const bundle = await readBundle(values.staging, identifier, digest);
    const path = await registryVersion(values.registry, identifier, true);
    await writeBundle(path, bundle, { sealed: true });
    report({ course: pinned.course, version: pinned.version, sha256: bundle.digest });
    return;
  }
  const profile = await readMaintainerProfile(values["env-file"], command);
  const destination = selectMaintainerDestination(profile.origin);
  const client = api(profile);
  if (command === "status") {
    report(await installedCourse(client, destination, pinned, digest));
    return;
  }
  const path = await registryVersion(values.registry, identifier);
  const bundle = await readBundle(path, identifier, digest);
  report(await publishCourse(client, destination, bundle, values.replace));
}

main().catch(reportError);
