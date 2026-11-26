import { parseArgs } from "node:util";
import { DIGEST, fail, pin } from "./content.mjs";

export function invocation(args, commands) {
  const [command, ...tokens] = args;
  if (!Object.hasOwn(commands, command)) fail(`Use one of ${Object.keys(commands).join(", ")} followed by course@version and command options`);
  const { values, positionals } = parseArgs({
    args: tokens, allowPositionals: true,
    options: Object.fromEntries(commands[command].map((name) =>
      name.endsWith("-reviewed") ? [name, { type: "boolean" }] : [name, { type: "string" }],
    )),
  });
  if (positionals.length !== 1) fail("Provide one course@version argument");
  const [identifier] = positionals;
  const pinned = pin(identifier);
  const digest = values.sha256;
  if ((command !== "export" && command !== "validate") || digest !== undefined) {
    if (!DIGEST.test(digest ?? "")) fail("Provide the approved manifest --sha256");
  }
  if (values.replace !== undefined) pin(`${pinned.course}@${values.replace}`);
  return { command, identifier, pinned, digest, values };
}

export function report(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

export function reportError(error) {
  process.stderr.write(`Course bundle: ${error.message}\n`);
  process.exitCode = 1;
}
