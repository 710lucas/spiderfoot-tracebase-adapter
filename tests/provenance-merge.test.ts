import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeProvenance } from "../src/provenance-merge.ts";

test("lists the references of both events, each once", () => {
  const merged = mergeProvenance({ recordRefs: ["a", "b"] }, { recordRefs: ["b", "c"] });

  assert.deepEqual(merged.recordRefs, ["a", "b", "c"]);
});

test("keeps the lowest confidence and the latest observedAt", () => {
  const merged = mergeProvenance(
    { confidence: 90, observedAt: 1000 },
    { confidence: 70, observedAt: 5000 },
  );

  assert.deepEqual(merged, { confidence: 70, observedAt: 5000 });
});

test("a field only one of them has is taken from it, and a field neither has stays out", () => {
  assert.deepEqual(mergeProvenance({}, { confidence: 80, observedAt: 5 }), {
    confidence: 80,
    observedAt: 5,
  });
  assert.deepEqual(mergeProvenance({}, {}), {});
});

test("keeps the module of the first event", () => {
  assert.equal(mergeProvenance({ module: "sfp_a" }, { module: "sfp_a" }).module, "sfp_a");
});
