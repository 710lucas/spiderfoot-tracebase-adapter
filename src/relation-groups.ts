import type { RelationPayload } from "./import-payload.ts";
import { mergeProvenance } from "./provenance-merge.ts";

export interface RelationGroups {
  add(relation: RelationPayload): void;
  toPayloads(): RelationPayload[];
}

// Collects the relations of a scan into the relations the API receives.
//
// SpiderFoot reports the same link more than once in a scan: another event, a few milliseconds later, for
// the same module, source and target (2,109 extra relations in the large scan, up to 84 for one link). They
// are one finding seen several times, so the reader sends ONE relation whose `recordRefs` lists every event
// behind it. The API keeps one edge per (tool, run, module, source, target, type) and would drop the
// references of the repeats, and the join has to happen here because it is the tool's own scan that knows
// which events belong together. The provenance of the relation is merged by `mergeProvenance`.
//
// The relations come out in the order their first event appeared.
export function createRelationGroups(): RelationGroups {
  const groups = new Map<string, RelationPayload>();

  return {
    add(relation) {
      // A JSON list is one text per combination, so two different combinations never collide.
      const key = JSON.stringify([
        relation.provenance.module ?? null,
        relation.source.type,
        relation.source.value,
        relation.target.type,
        relation.target.value,
      ]);
      const group = groups.get(key);

      groups.set(
        key,
        group === undefined
          ? relation
          : { ...group, provenance: mergeProvenance(group.provenance, relation.provenance) },
      );
    },

    toPayloads: () => [...groups.values()],
  };
}
