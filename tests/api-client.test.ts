import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBatches, sendBatches } from "../src/api-client.ts";
import type { AttributePayload, ImportPayload, RelationPayload } from "../src/import-payload.ts";
import { ReaderError } from "../src/reader-error.ts";
import { startFakeApi } from "./fake-api.ts";

function relation(value: string): RelationPayload {
  return {
    source: { type: "A", value: "source" },
    target: { type: "B", value },
    provenance: { recordRef: value },
  };
}

function attribute(value: string): AttributePayload {
  return { entity: { type: "A", value: "source" }, name: "NAME", values: [value], provenance: {} };
}

test("small scans go in one batch per kind, all tied to the scan by `run`", () => {
  const batches = buildBatches("scan-1", [relation("x")], [attribute("y")], 100_000);

  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.map((batch) => batch.source),
    [
      { tool: "spiderfoot", run: "scan-1" },
      { tool: "spiderfoot", run: "scan-1" },
    ],
  );
  assert.equal(batches[0]?.relations.length, 1);
  assert.equal(batches[1]?.attributes.length, 1);
});

test("a scan with nothing to send makes no batches", () => {
  assert.deepEqual(buildBatches("scan-1", [], [], 1000), []);
});

test("batches are split so none exceeds the byte limit", () => {
  const relations = Array.from({ length: 50 }, (_, index) => relation(`value-${index}`));
  const limit = 1500;

  const batches = buildBatches("scan-1", relations, [], limit);

  assert.ok(batches.length > 1);
  for (const batch of batches) {
    assert.ok(Buffer.byteLength(JSON.stringify(batch)) <= limit);
  }
  assert.equal(batches.flatMap((batch) => batch.relations).length, 50);
});

test("an item too big for any batch still goes alone", () => {
  const batches = buildBatches("scan-1", [relation("a".repeat(500)), relation("b")], [], 300);

  assert.deepEqual(
    batches.map((batch) => batch.relations.length),
    [1, 1],
  );
});

test("every batch the API accepts is counted", async () => {
  const api = await startFakeApi([202]);
  try {
    const batches = buildBatches("scan-1", [relation("x")], [attribute("y")], 100_000);

    const progress: string[] = [];
    const summary = await sendBatches(api.url, batches, (number, count) =>
      progress.push(`${number}/${count}`),
    );

    assert.deepEqual(summary, { acceptedBatches: 2, rejections: [] });
    assert.deepEqual(progress, ["1/2", "2/2"]);
    assert.equal(api.receivedBodies.length, 2);
  } finally {
    await api.close();
  }
});

test("a rejected batch is recorded and the next ones are still sent", async () => {
  const api = await startFakeApi([400, 202]);
  try {
    const batches: ImportPayload[] = buildBatches("s", [relation("x")], [attribute("y")], 100_000);

    const summary = await sendBatches(api.url, batches);

    assert.equal(summary.acceptedBatches, 1);
    assert.equal(summary.rejections.length, 1);
    assert.match(summary.rejections[0] as string, /^batch 1: HTTP 400/);
  } finally {
    await api.close();
  }
});

test("an API that cannot be reached stops the sending with a reader error", async () => {
  const api = await startFakeApi();
  const unreachableUrl = api.url;
  await api.close();

  await assert.rejects(
    sendBatches(unreachableUrl, buildBatches("s", [relation("x")], [], 1000)),
    (error: unknown) => error instanceof ReaderError && error.message.includes(unreachableUrl),
  );
});
