import type { AttributePayload, EntityReference, ItemProvenance } from "./import-payload.ts";
import type { ScanEvent } from "./scan-reader.ts";

export interface AttributeGroups {
  add(event: ScanEvent, entity: EntityReference, value: string, provenance: ItemProvenance): void;
  toPayloads(): AttributePayload[];
}

interface AttributeGroup {
  entity: EntityReference;
  name: string;
  values: Set<string>;
  provenance: ItemProvenance;
}

// Collects the attribute events of a scan into the attributes the API receives.
//
// One module looking at one event emits many events of the same type under it: every unusual header of
// one response, every hash found in one page. They are not alternatives to each other, they were found
// together, so they travel as ONE attribute holding all the values. The group is therefore the events that
// share a parent event, an event type and a module.
//
// The provenance of a group has to speak for several events:
// - `recordRef` is the hash of the parent event, the event the values were found in (and where the raw
//   data of the finding will be kept);
// - `confidence` is the lowest of the group, the conservative reading;
// - `observedAt` is the latest of the group, since the set is only complete when its last event exists.
export function createAttributeGroups(): AttributeGroups {
  const groups = new Map<string, AttributeGroup>();

  return {
    add(event, entity, value, provenance) {
      // A JSON list is one text per combination, so two different combinations never collide.
      const key = JSON.stringify([event.parentHash, event.type, event.module]);
      const group = groups.get(key);

      if (group === undefined) {
        groups.set(key, {
          entity,
          name: event.type,
          values: new Set([value]),
          provenance: { ...provenance, recordRef: event.parentHash },
        });
        return;
      }

      group.values.add(value);
      group.provenance = mergeProvenance(group.provenance, provenance);
    },

    toPayloads: () =>
      [...groups.values()].map((group) => ({
        entity: group.entity,
        name: group.name,
        values: [...group.values],
        provenance: group.provenance,
      })),
  };
}

function mergeProvenance(group: ItemProvenance, event: ItemProvenance): ItemProvenance {
  const confidence = pick(Math.min, group.confidence, event.confidence);
  const observedAt = pick(Math.max, group.observedAt, event.observedAt);

  return {
    ...group,
    ...(confidence !== undefined && { confidence }),
    ...(observedAt !== undefined && { observedAt }),
  };
}

// The result of `choose` over the numbers that exist; `undefined` when neither does.
function pick(
  choose: (...numbers: number[]) => number,
  first: number | undefined,
  second: number | undefined,
): number | undefined {
  const existing = [first, second].filter((number) => number !== undefined);

  return existing.length === 0 ? undefined : choose(...existing);
}
