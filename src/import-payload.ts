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
  // Everything one module found together under one parent event (see `attribute-groups.ts`).
  values: string[];
  provenance: ItemProvenance;
}

export interface ImportPayload {
  source: { tool: string; run: string };
  relations: RelationPayload[];
  attributes: AttributePayload[];
}
