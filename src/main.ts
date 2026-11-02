import { parseCliOptions, USAGE } from "./cli-options.ts";
import { runCommand } from "./commands.ts";
import { openDatabase } from "./open-database.ts";
import { ReaderError } from "./reader-error.ts";

try {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.kind === "help") {
    console.log(USAGE);
  } else {
    await runCommand(await openDatabase(options.source), options.command);
  }
} catch (error) {
  if (!(error instanceof ReaderError)) {
    throw error;
  }
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}
