import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttributeGroups } from "../src/attribute-groups.ts";
import type { ScanEvent } from "../src/scan-reader.ts";

const owner = { type: "LINKED_URL_INTERNAL", value: "http://x/" };

function event(overrides: Partial<ScanEvent> = {}): ScanEvent {
  return {
    hash: "event",
    type: "HASH",
    kind: "DESCRIPTOR",
    data: "data",
    module: "sfp_hashes",
    confidence: 100,
    generatedAtSeconds: 1000,
    falsePositive: false,
    parentHash: "content",
    ...overrides,
  };
}

test("an event alone is a group of one value", () => {
  const groups = createAttributeGroups();

  groups.add(event(), owner, "[MD5] 1", { confidence: 100, observedAt: 1000000 });

  assert.deepEqual(groups.toPayloads(), [
    {
      entity: owner,
      name: "HASH",
      values: ["[MD5] 1"],
      provenance: { confidence: 100, observedAt: 1000000, recordRef: "content" },
    },
  ]);
});

test("the groups come in the order their first event appeared", () => {
  const groups = createAttributeGroups();

  groups.add(event({ type: "B" }), owner, "b", {});
  groups.add(event({ type: "A" }), owner, "a", {});
  groups.add(event({ type: "B" }), owner, "b2", {});

  assert.deepEqual(
    groups.toPayloads().map((attribute) => [attribute.name, attribute.values]),
    [
      ["B", ["b", "b2"]],
      ["A", ["a"]],
    ],
  );
});

test("provenance fields the events did not send stay out of the group", () => {
  const groups = createAttributeGroups();

  groups.add(event(), owner, "one", {});
  groups.add(event(), owner, "two", {});

  assert.deepEqual(groups.toPayloads()[0]?.provenance, { recordRef: "content" });
});

test("a field only some events sent is taken from the ones that sent it", () => {
  const groups = createAttributeGroups();

  groups.add(event(), owner, "one", {});
  groups.add(event(), owner, "two", { confidence: 80, observedAt: 5 });
  groups.add(event(), owner, "three", {});

  assert.deepEqual(groups.toPayloads()[0]?.provenance, {
    recordRef: "content",
    confidence: 80,
    observedAt: 5,
  });
});
