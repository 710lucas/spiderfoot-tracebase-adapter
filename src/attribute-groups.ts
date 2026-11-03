import type { AttributePayload, EntityReference, ItemProvenance } from "./import-payload.ts";
import { mergeProvenance } from "./provenance-merge.ts";
import type { ScanEvent } from "./scan-reader.ts";

export interface AttributeGroups {
  add(event: ScanEvent, entity: EntityReference, value: string, provenance: ItemProvenance): void;
  toPayloads(): AttributePayload[];
}

interface AttributeGroup {
  entity: EntityReference;
  name: string;
  qualifier?: string;
  values: Set<string>;
  provenance: ItemProvenance;
}

// Collects the attribute events of a scan into the attributes the API receives.
//
// One module looking at an entity emits many events of the same type: every unusual header of one
// response, every hash found in one page or in one DNS record. They are not alternatives to each other,
// they were found together, so they travel as ONE attribute holding all the values. The group is therefore
// the events that share an entity, an event type and a module. The parent event is NOT part of the group:
// the same module reaches one entity through several parents (two pages, two DNS records), and those are
// still the same source speaking about the same entity.
//
// The module is the attribute's qualifier: different modules saying the same thing about one entity (three
// blocklists listing one network) are different sources, so they are different attributes and none
// replaces another. Without a module there is no qualifier.
//
// The provenance of a group has to speak for several events, and is merged by `mergeProvenance`:
// `recordRefs` lists the hash of every event that carries a value of the set (not their parents), the
// confidence is the lowest and `observedAt` the latest.
export function createAttributeGroups(): AttributeGroups {
  const groups = new Map<string, AttributeGroup>();

  return {
    add(event, entity, value, provenance) {
      // A JSON list is one text per combination, so two different combinations never collide.
      const key = JSON.stringify([entity.type, entity.value, event.type, event.module]);
      const group = groups.get(key);

      if (group === undefined) {
        groups.set(key, {
          entity,
          name: event.type,
          ...(event.module !== "" && { qualifier: event.module }),
          values: new Set([value]),
          provenance,
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
        ...(group.qualifier !== undefined && { qualifier: group.qualifier }),
        values: [...group.values],
        provenance: group.provenance,
      })),
  };
}
