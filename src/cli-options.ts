import { parseArgs } from "node:util";
import type { DatabaseSource } from "./open-database.ts";
import { ReaderError } from "./reader-error.ts";

export const DEFAULT_API_URL = "http://localhost:3000";
export const DEFAULT_MAX_BATCH_BYTES = 90_000;

export const USAGE = `spiderfoot-reader: sends SpiderFoot scans to the OSINT graph import API

Usage:
  spiderfoot-reader list --mode <local|docker>
  spiderfoot-reader scan <scan-id> --mode <local|docker> [--api <url>] [--max-batch-bytes <n>]

Commands:
  list            Lists the scans found in SpiderFoot.
  scan <scan-id>  Sends one scan to the API. Get the id from "list".

Options:
  --mode, -m <local|docker>  Where SpiderFoot runs (required).
  --db <path>                local only: the spiderfoot.db file (default: $SPIDERFOOT_DATA or ~/.spiderfoot).
  --container <name>         docker only: the SpiderFoot container (default: the only one found).
  --api <url>                The import API (default: $OSINT_API or ${DEFAULT_API_URL}).
  --max-batch-bytes <n>      Largest request body in bytes (default: ${DEFAULT_MAX_BATCH_BYTES}).
  --help, -h                 Shows this text.
`;

export type CliCommand =
  { name: "list" } | { name: "scan"; scanId: string; apiUrl: string; maxBatchBytes: number };

export type CliOptions =
  { kind: "help" } | { kind: "run"; source: DatabaseSource; command: CliCommand };

export function parseCliOptions(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
): CliOptions {
  const { values, positionals } = parseCommandLine(argv);
  if (values.help || positionals.length === 0) {
    return { kind: "help" };
  }
  const source = buildSource(values);
  const [commandName, scanId] = positionals;
  if (commandName === "list" && positionals.length === 1) {
    return { kind: "run", source, command: { name: "list" } };
  }
  if (commandName === "scan" && scanId !== undefined && positionals.length === 2) {
    return {
      kind: "run",
      source,
      command: {
        name: "scan",
        scanId,
        apiUrl: values.api ?? environment["OSINT_API"] ?? DEFAULT_API_URL,
        maxBatchBytes: parseMaxBatchBytes(values["max-batch-bytes"]),
      },
    };
  }
  throw new ReaderError(`unknown or incomplete command: ${positionals.join(" ")}\n\n${USAGE}`);
}

function parseCommandLine(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        mode: { type: "string", short: "m" },
        db: { type: "string" },
        container: { type: "string" },
        api: { type: "string" },
        "max-batch-bytes": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new ReaderError(`${(error as Error).message}\n\n${USAGE}`);
  }
}

function buildSource(values: { mode?: string; db?: string; container?: string }): DatabaseSource {
  if (values.mode === "local") {
    if (values.container !== undefined) {
      throw new ReaderError("--container only applies to --mode docker");
    }
    return values.db === undefined ? { mode: "local" } : { mode: "local", databasePath: values.db };
  }
  if (values.mode === "docker") {
    if (values.db !== undefined) {
      throw new ReaderError("--db only applies to --mode local");
    }
    return values.container === undefined
      ? { mode: "docker" }
      : { mode: "docker", container: values.container };
  }
  throw new ReaderError(`--mode is required and must be "local" or "docker"\n\n${USAGE}`);
}

function parseMaxBatchBytes(text: string | undefined): number {
  if (text === undefined) {
    return DEFAULT_MAX_BATCH_BYTES;
  }
  const maxBatchBytes = Number(text);
  if (!Number.isInteger(maxBatchBytes) || maxBatchBytes < 1) {
    throw new ReaderError(`--max-batch-bytes must be a positive whole number, got "${text}"`);
  }
  return maxBatchBytes;
}
