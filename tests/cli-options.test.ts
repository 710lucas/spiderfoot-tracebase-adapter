import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_API_URL, DEFAULT_MAX_BATCH_BYTES, parseCliOptions } from "../src/cli-options.ts";
import { ReaderError } from "../src/reader-error.ts";

test("no arguments and --help both ask for the help text", () => {
  assert.deepEqual(parseCliOptions([]), { kind: "help" });
  assert.deepEqual(parseCliOptions(["list", "--help"]), { kind: "help" });
});

test("list with the local mode", () => {
  assert.deepEqual(parseCliOptions(["list", "--mode", "local"], {}), {
    kind: "run",
    source: { mode: "local" },
    command: { name: "list" },
  });
});

test("list with the docker mode and a container", () => {
  assert.deepEqual(parseCliOptions(["list", "-m", "docker", "--container", "sf"], {}), {
    kind: "run",
    source: { mode: "docker", container: "sf" },
    command: { name: "list" },
  });
});

test("scan takes the scan id and uses the defaults", () => {
  assert.deepEqual(parseCliOptions(["scan", "ABC123", "--mode", "docker"], {}), {
    kind: "run",
    source: { mode: "docker" },
    command: {
      name: "scan",
      scanId: "ABC123",
      apiUrl: DEFAULT_API_URL,
      maxBatchBytes: DEFAULT_MAX_BATCH_BYTES,
    },
  });
});

test("the API address comes from --api, then OSINT_API, then the default", () => {
  const fromEnvironment = parseCliOptions(["scan", "A", "--mode", "local"], {
    OSINT_API: "http://env:1",
  });
  const fromOption = parseCliOptions(
    ["scan", "A", "--mode", "local", "--api", "http://option:2", "--max-batch-bytes", "5000"],
    { OSINT_API: "http://env:1" },
  );

  assert.deepEqual(fromEnvironment.kind === "run" && fromEnvironment.command, {
    name: "scan",
    scanId: "A",
    apiUrl: "http://env:1",
    maxBatchBytes: DEFAULT_MAX_BATCH_BYTES,
  });
  assert.deepEqual(fromOption.kind === "run" && fromOption.command, {
    name: "scan",
    scanId: "A",
    apiUrl: "http://option:2",
    maxBatchBytes: 5000,
  });
});

test("--db is accepted in local mode", () => {
  assert.deepEqual(parseCliOptions(["list", "--mode", "local", "--db", "/x/sf.db"], {}), {
    kind: "run",
    source: { mode: "local", databasePath: "/x/sf.db" },
    command: { name: "list" },
  });
});

const INVALID_COMMAND_LINES: [string, string[]][] = [
  ["a missing mode", ["list"]],
  ["an unknown mode", ["list", "--mode", "cloud"]],
  ["--container in local mode", ["list", "--mode", "local", "--container", "x"]],
  ["--db in docker mode", ["list", "--mode", "docker", "--db", "x"]],
  ["scan without an id", ["scan", "--mode", "local"]],
  ["an unknown command", ["import", "--mode", "local"]],
  ["extra words after list", ["list", "more", "--mode", "local"]],
  ["an unknown option", ["list", "--mode", "local", "--nope"]],
  ["a batch size that is not a number", ["scan", "A", "--mode", "local", "--max-batch-bytes", "x"]],
  ["a batch size of zero", ["scan", "A", "--mode", "local", "--max-batch-bytes", "0"]],
];

for (const [description, argv] of INVALID_COMMAND_LINES) {
  test(`rejects ${description}`, () => {
    assert.throws(() => parseCliOptions(argv, {}), ReaderError);
  });
}
