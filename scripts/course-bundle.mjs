import { parseArgs } from "node:util";
import { loadDevProfile, parseProfileArgs } from "./dev-profile.mjs";
import { invocation, report, reportError } from "./course-bundles/cli.mjs";
import { DIGEST, fail, pin } from "./course-bundles/content.mjs";
import { readBundle, registryVersion, writeBundle } from "./course-bundles/files.mjs";
import { api, installedCourse, maintainerDestinationKey, publishCourse, selectDeveloperDestination } from "./course-bundles/supabase.mjs";

async function pullIntoDev(envFile, args) {
  const { values: options } = parseArgs({ args, options: {
    bundle: { type: "string" },
    sha256: { type: "string" },
    replace: { type: "string" },
  } });
  const identifier = options.bundle;
  const { course } = pin(identifier);
  if (options.replace !== undefined) pin(`${course}@${options.replace}`);
  const { values, target } = loadDevProfile({ envFile, requiredKeys: [
    maintainerDestinationKey, "COURSE_BUNDLE_REGISTRY", "COURSE_BUNDLE_DESTINATION_ID",
  ] });
  const destination = selectDeveloperDestination(target, values.COURSE_BUNDLE_DESTINATION_ID);
  const digest = options.sha256 ?? values.COURSE_BUNDLE_MANIFEST_SHA256;
  if (!DIGEST.test(digest ?? "")) fail("Provide the approved manifest --sha256 or COURSE_BUNDLE_MANIFEST_SHA256");
  const bundle = await readBundle(await registryVersion(values.COURSE_BUNDLE_REGISTRY, identifier), identifier, digest);
  const client = api({ origin: destination.origin, key: values[maintainerDestinationKey] });
  report(await publishCourse(client, destination, bundle, options.replace));
}

async function main() {
  const { envFile, args } = parseProfileArgs(process.argv.slice(2));
  if (args[0] === "data-pull") {
    await pullIntoDev(envFile, args.slice(1));
    return;
  }
  const { command, identifier, pinned, digest, values } = invocation(args, {
    pull: ["registry", "out", "sha256"],
    validate: ["bundle", "sha256"],
    import: ["bundle", "sha256", "destination", "replace"],
    status: ["sha256", "destination"],
  });
  if (command === "pull" || command === "validate") {
    const path = command === "pull" ? await registryVersion(values.registry, identifier) : values.bundle;
    const bundle = await readBundle(path, identifier, digest);
    if (command === "pull") await writeBundle(values.out, bundle, { sealed: true });
    report({ ...bundle.manifest, sha256: bundle.digest });
    return;
  }
  const profile = loadDevProfile({ envFile, requiredKeys: [maintainerDestinationKey] });
  const destination = selectDeveloperDestination(profile.target, values.destination);
  const client = api({ origin: destination.origin, key: profile.values[maintainerDestinationKey] });
  if (command === "status") {
    report(await installedCourse(client, destination, pinned, digest));
    return;
  }
  const bundle = await readBundle(values.bundle, identifier, digest);
  report(await publishCourse(client, destination, bundle, values.replace));
}

main().catch(reportError);
