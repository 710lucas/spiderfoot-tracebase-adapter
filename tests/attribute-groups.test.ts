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

  groups.add(event(), owner, "[MD5] 1", {
    confidence: 100,
    observedAt: 1000000,
    recordRefs: ["e1"],
  });

  assert.deepEqual(groups.toPayloads(), [
    {
      entity: owner,
      name: "HASH",
      qualifier: "sfp_hashes",
      values: ["[MD5] 1"],
      provenance: { confidence: 100, observedAt: 1000000, recordRefs: ["e1"] },
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

  assert.deepEqual(groups.toPayloads()[0]?.provenance, {});
});

test("a field only some events sent is taken from the ones that sent it", () => {
  const groups = createAttributeGroups();

  groups.add(event(), owner, "one", {});
  groups.add(event(), owner, "two", { confidence: 80, observedAt: 5 });
  groups.add(event(), owner, "three", {});

  assert.deepEqual(groups.toPayloads()[0]?.provenance, { confidence: 80, observedAt: 5 });
});

test("the module is the qualifier, and different modules are different attributes", () => {
  const groups = createAttributeGroups();

  groups.add(event({ type: "MALICIOUS_SUBNET", module: "sfp_cinsscore" }), owner, "a", {});
  groups.add(event({ type: "MALICIOUS_SUBNET", module: "sfp_blocklistde" }), owner, "b", {});

  assert.deepEqual(
    groups.toPayloads().map((attribute) => [attribute.name, attribute.qualifier, attribute.values]),
    [
      ["MALICIOUS_SUBNET", "sfp_cinsscore", ["a"]],
      ["MALICIOUS_SUBNET", "sfp_blocklistde", ["b"]],
    ],
  );
});

test("an event with no module has no qualifier", () => {
  const groups = createAttributeGroups();

  groups.add(event({ module: "" }), owner, "a", {});

  assert.equal("qualifier" in (groups.toPayloads()[0] ?? {}), false);
});

test("the same module reaching an entity through two parents is one attribute with every value", () => {
  const groups = createAttributeGroups();

  groups.add(event({ parentHash: "page" }), owner, "[MD5] 1", { observedAt: 1000 });
  groups.add(event({ parentHash: "dns" }), owner, "[SHA1] 2", { observedAt: 2000 });

  const [attribute, ...others] = groups.toPayloads();

  assert.equal(others.length, 0);
  assert.deepEqual(attribute?.values, ["[MD5] 1", "[SHA1] 2"]);
});

test("the recordRefs are the events that carry the values, each once, whatever the parents", () => {
  const groups = createAttributeGroups();

  groups.add(event({ parentHash: "page" }), owner, "[MD5] 1", { recordRefs: ["e1"] });
  groups.add(event({ parentHash: "dns" }), owner, "[SHA1] 2", { recordRefs: ["e2"] });
  groups.add(event({ parentHash: "dns" }), owner, "[SHA1] 2", { recordRefs: ["e2"] });

  assert.deepEqual(groups.toPayloads()[0]?.provenance.recordRefs, ["e1", "e2"]);
});

test("two entities never share a group, even for the same type and module", () => {
  const groups = createAttributeGroups();
  const other = { type: "LINKED_URL_INTERNAL", value: "http://y/" };

  groups.add(event(), owner, "a", {});
  groups.add(event(), other, "b", {});

  assert.equal(groups.toPayloads().length, 2);
});
