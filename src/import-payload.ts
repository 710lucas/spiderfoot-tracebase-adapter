// The JSON the import API accepts, as documented in the API's `docs/import-payload.md`. This tool is
// a separate program, so it keeps its own copy of the shape instead of importing it.
export interface EntityReference {
  type: string;
  value: string;
}

export interface ItemProvenance {
  recordRef?: string;
  module?: string;
  confidence?: number;
  observedAt?: number;
}

export interface RelationPayload {
  source: EntityReference;
  target: EntityReference;
  provenance: ItemProvenance;
}

export interface AttributePayload {
  entity: EntityReference;
  name: string;
  // The module that found the set, so that what different modules say about the same entity and name
  // lives side by side (see the API's glossary, "Qualifier"). Left out when the event has no module.
  qualifier?: string;
  // Everything one module found about the entity under this name (see `attribute-groups.ts`).
  values: string[];
  provenance: ItemProvenance;
}

export interface ImportPayload {
  source: { tool: string; run: string };
  relations: RelationPayload[];
  attributes: AttributePayload[];
}
