import { test } from "node:test";
import assert from "node:assert/strict";
import type { RelationPayload } from "../src/import-payload.ts";
import { createRelationGroups } from "../src/relation-groups.ts";

function relation(overrides: Partial<RelationPayload> = {}): RelationPayload {
  return {
    source: { type: "A", value: "source" },
    target: { type: "B", value: "target" },
    provenance: { module: "sfp_x", recordRefs: ["e1"] },
    ...overrides,
  };
}

test("a relation alone comes out as it is", () => {
  const groups = createRelationGroups();
  const only = relation();

  groups.add(only);

  assert.deepEqual(groups.toPayloads(), [only]);
});

test("the same module, source and target are one relation with every reference", () => {
  const groups = createRelationGroups();

  groups.add(relation({ provenance: { module: "sfp_x", recordRefs: ["e1"], observedAt: 1 } }));
  groups.add(relation({ provenance: { module: "sfp_x", recordRefs: ["e2"], observedAt: 3 } }));

  assert.deepEqual(groups.toPayloads(), [
    relation({ provenance: { module: "sfp_x", recordRefs: ["e1", "e2"], observedAt: 3 } }),
  ]);
});

test("another module, source or target is another relation", () => {
  const groups = createRelationGroups();

  groups.add(relation());
  groups.add(relation({ provenance: { module: "sfp_y", recordRefs: ["e2"] } }));
  groups.add(relation({ source: { type: "A", value: "other" } }));
  groups.add(relation({ target: { type: "B", value: "other" } }));

  assert.equal(groups.toPayloads().length, 4);
});

test("a relation without a module is not the same as one with a module", () => {
  const groups = createRelationGroups();

  groups.add(relation());
  groups.add(relation({ provenance: { recordRefs: ["e2"] } }));

  assert.equal(groups.toPayloads().length, 2);
});

test("the relations come in the order their first event appeared", () => {
  const groups = createRelationGroups();

  groups.add(relation({ target: { type: "B", value: "first" } }));
  groups.add(relation({ target: { type: "B", value: "second" } }));
  groups.add(relation({ target: { type: "B", value: "first" }, provenance: { module: "sfp_x" } }));

  assert.deepEqual(
    groups.toPayloads().map((item) => item.target.value),
    ["first", "second"],
  );
});
