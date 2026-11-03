import type {
  AttributePayload,
  EntityReference,
  ItemProvenance,
  RelationPayload,
} from "./import-payload.ts";
import { createAttributeGroups } from "./attribute-groups.ts";
import { createRelationGroups } from "./relation-groups.ts";
import type { ScanEvent } from "./scan-reader.ts";

export interface MappedScan {
  relations: RelationPayload[];
  attributes: AttributePayload[];
  falsePositives: number;
  withoutEntity: number;
}

const ENTITY_KINDS = new Set(["ENTITY", "SUBENTITY"]);
const ATTRIBUTE_KINDS = new Set(["DESCRIPTOR", "DATA"]);
const INTERNAL_KIND = "INTERNAL";

// SpiderFoot wraps URLs in its event data with these tags.
const URL_TAGS = /<\/?SFURL>/g;

// The scan target has no event type of its own; SpiderFoot guesses it from the text (see
// `targetTypeFromString` in its helpers). Same patterns, same order.
const TARGET_TYPE_PATTERNS: [RegExp, string][] = [
  [/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/i, "IP_ADDRESS"],
  [/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\/\d+$/i, "NETBLOCK_OWNER"],
  [/^.*@.*$/i, "EMAILADDR"],
  [/^\+[0-9]+$/i, "PHONE_NUMBER"],
  [/^".+\s+.+"$/i, "HUMAN_NAME"],
  [/^".+"$/i, "USERNAME"],
  [/^[0-9]+$/i, "BGP_AS_OWNER"],
  [/^[0-9a-f:]+$/i, "IPV6_ADDRESS"],
  [/^[0-9a-f:]+::\/[0-9]+$/i, "NETBLOCKV6_OWNER"],
  [
    /^(([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])\.)+([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/i,
    "INTERNET_NAME",
  ],
];
// SpiderFoot's own name for the starting point of a scan, used when the text matches no pattern.
const UNKNOWN_TARGET_TYPE = "ROOT";

// Turns the events of one scan into relations and attributes.
//
// SpiderFoot already says what each event is: ENTITY and SUBENTITY events are things found (they
// become entities linked to the thing that led to them); DESCRIPTOR and DATA events describe a thing
// (they become attributes of the nearest entity above them, the ones one module found about one entity
// under one type as a single attribute, see `attribute-groups.ts`; the relations reported more than once
// are joined into one, see `relation-groups.ts`); INTERNAL is the scan target.
//
// Events with no usable text, and events whose chain of parents never reaches an entity, are counted
// instead of sent: the API rejects a whole batch for a single blank value.
export function mapScanEvents(events: ScanEvent[]): MappedScan {
  const eventsByHash = new Map(events.map((event) => [event.hash, event]));
  const mapped: MappedScan = { relations: [], attributes: [], falsePositives: 0, withoutEntity: 0 };
  const attributeGroups = createAttributeGroups();
  const relationGroups = createRelationGroups();

  for (const event of events) {
    if (event.kind === INTERNAL_KIND) {
      continue;
    }
    if (event.falsePositive) {
      mapped.falsePositives++;
      continue;
    }
    const value = cleanEventData(event.data);
    const owner = findOwningEntity(event, eventsByHash);
    if (value === "" || owner === null) {
      mapped.withoutEntity++;
      continue;
    }
    const provenance = buildProvenance(event);
    if (ENTITY_KINDS.has(event.kind)) {
      relationGroups.add({ source: owner, target: { type: event.type, value }, provenance });
    } else if (ATTRIBUTE_KINDS.has(event.kind)) {
      attributeGroups.add(event, owner, value, provenance);
    }
  }
  mapped.relations = relationGroups.toPayloads();
  mapped.attributes = attributeGroups.toPayloads();
  return mapped;
}

// The entity an event hangs from: its nearest ancestor that is an entity (or the scan target).
// Attributes in between are skipped, because an entity cannot hang from an attribute.
function findOwningEntity(
  event: ScanEvent,
  eventsByHash: Map<string, ScanEvent>,
): EntityReference | null {
  const visited = new Set<string>([event.hash]);
  let parent = eventsByHash.get(event.parentHash);
  while (parent !== undefined && !visited.has(parent.hash)) {
    if (parent.kind === INTERNAL_KIND || ENTITY_KINDS.has(parent.kind)) {
      return toEntity(parent);
    }
    visited.add(parent.hash);
    parent = eventsByHash.get(parent.parentHash);
  }
  return null;
}

function toEntity(event: ScanEvent): EntityReference | null {
  const value = cleanEventData(event.data);
  if (value === "") {
    return null;
  }
  const type = event.kind === INTERNAL_KIND ? guessTargetType(value) : event.type;
  return { type, value };
}

function guessTargetType(target: string): string {
  const match = TARGET_TYPE_PATTERNS.find(([pattern]) => pattern.test(target));
  return match === undefined ? UNKNOWN_TARGET_TYPE : match[1];
}

function cleanEventData(data: string): string {
  return data.replace(URL_TAGS, "").trim();
}

function buildProvenance(event: ScanEvent): ItemProvenance {
  return {
    recordRefs: [event.hash],
    ...(event.module !== "" && { module: event.module }),
    confidence: event.confidence,
    observedAt: Math.round(event.generatedAtSeconds * 1000),
  };
}
