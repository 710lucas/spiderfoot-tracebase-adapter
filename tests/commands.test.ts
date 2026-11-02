import { afterEach, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "../src/commands.ts";
import type { Database, Row } from "../src/database.ts";
import { ReaderError } from "../src/reader-error.ts";
import { startFakeApi } from "./fake-api.ts";

afterEach(() => {
  process.exitCode = undefined;
});

const SCAN_ROW: Row = {
  guid: "scan-1",
  name: "first",
  seed_target: "example.com",
  status: "FINISHED",
  event_count: 2,
};

const EVENT_ROWS: Row[] = [
  {
    hash: "ROOT",
    type: "ROOT",
    kind: "INTERNAL",
    data: "example.com",
    module: "",
    confidence: 100,
    generated: 1,
    false_positive: 0,
    source_event_hash: "ROOT",
  },
  {
    hash: "h1",
    type: "IP_ADDRESS",
    kind: "ENTITY",
    data: "1.1.1.1",
    module: "sfp_dns",
    confidence: 100,
    generated: 2,
    false_positive: 0,
    source_event_hash: "ROOT",
  },
];

// A database that answers the two queries the commands make.
function fakeDatabase(scanRows: Row[]): Database {
  return {
    query: async (sql) => (sql.includes("tbl_scan_instance") ? scanRows : EVENT_ROWS),
  };
}

function captureOutput(t: TestContext) {
  const log = t.mock.method(console, "log", () => {});
  const warn = t.mock.method(console, "warn", () => {});
  const error = t.mock.method(console, "error", () => {});
  const lines = (mock: typeof log) => mock.mock.calls.map((call) => call.arguments.join(" "));
  return { log: () => lines(log), warn: () => lines(warn), error: () => lines(error) };
}

test("list prints one line per scan", async (t) => {
  const output = captureOutput(t);

  await runCommand(fakeDatabase([SCAN_ROW]), { name: "list" });

  assert.deepEqual(output.log(), [
    "ID\tSTATUS\tEVENTS\tTARGET\tNAME",
    "scan-1\tFINISHED\t2\texample.com\tfirst",
  ]);
});

test("list says so when there are no scans", async (t) => {
  const output = captureOutput(t);

  await runCommand(fakeDatabase([]), { name: "list" });

  assert.deepEqual(output.log(), ["No scans found."]);
});

test("scan reads the scan, sends it to the API and reports", async (t) => {
  const output = captureOutput(t);
  const api = await startFakeApi([202]);
  try {
    await runCommand(fakeDatabase([SCAN_ROW]), {
      name: "scan",
      scanId: "scan-1",
      apiUrl: api.url,
      maxBatchBytes: 100_000,
    });

    assert.equal(api.receivedBodies.length, 1);
    assert.match(output.log()[0] as string, /read 2 events: 1 relations, 0 attributes/);
    assert.match(output.log().at(-1) as string, /done: 1\/1 batches accepted/);
    assert.equal(process.exitCode, undefined);
  } finally {
    await api.close();
  }
});

test("scan warns when the scan has not finished", async (t) => {
  const output = captureOutput(t);
  const api = await startFakeApi([202]);
  try {
    await runCommand(fakeDatabase([{ ...SCAN_ROW, status: "RUNNING" }]), {
      name: "scan",
      scanId: "scan-1",
      apiUrl: api.url,
      maxBatchBytes: 100_000,
    });

    assert.match(output.warn()[0] as string, /RUNNING/);
  } finally {
    await api.close();
  }
});

test("scan fails with a non-zero exit code when the API rejects a batch", async (t) => {
  const output = captureOutput(t);
  const api = await startFakeApi([400]);
  try {
    await runCommand(fakeDatabase([SCAN_ROW]), {
      name: "scan",
      scanId: "scan-1",
      apiUrl: api.url,
      maxBatchBytes: 100_000,
    });

    assert.match(output.error()[0] as string, /^rejected batch 1: HTTP 400/);
    assert.equal(process.exitCode, 1);
  } finally {
    await api.close();
  }
});

test("scan reports an unknown scan id", async () => {
  await assert.rejects(
    runCommand(fakeDatabase([SCAN_ROW]), {
      name: "scan",
      scanId: "nope",
      apiUrl: "http://localhost:1",
      maxBatchBytes: 1000,
    }),
    (error: unknown) => error instanceof ReaderError && error.message.includes("list"),
  );
});
