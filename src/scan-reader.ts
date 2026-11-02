import type { Database } from "./database.ts";

export interface Scan {
  guid: string;
  name: string;
  target: string;
  status: string;
  eventCount: number;
}

// One row of a scan, as SpiderFoot stored it. `kind` is SpiderFoot's own classification of the event
// type (ENTITY, SUBENTITY, DESCRIPTOR, DATA or INTERNAL); `parentHash` points at the event that
// produced this one.
export interface ScanEvent {
  hash: string;
  type: string;
  kind: string;
  data: string;
  module: string;
  confidence: number;
  generatedAtSeconds: number;
  falsePositive: boolean;
  parentHash: string;
}

const LIST_SCANS_SQL = `
  SELECT s.guid, s.name, s.seed_target, s.status,
         (SELECT COUNT(*) FROM tbl_scan_results r WHERE r.scan_instance_id = s.guid) AS event_count
  FROM tbl_scan_instance s
  ORDER BY s.created`;

const READ_EVENTS_SQL = `
  SELECT r.hash, r.type, t.event_type AS kind, r.data, r.module, r.confidence, r.generated,
         r.false_positive, r.source_event_hash
  FROM tbl_scan_results r
  JOIN tbl_event_types t ON t.event = r.type
  WHERE r.scan_instance_id = ?`;

export async function listScans(database: Database): Promise<Scan[]> {
  const rows = await database.query(LIST_SCANS_SQL);
  return rows.map((row) => ({
    guid: String(row["guid"]),
    name: String(row["name"]),
    target: String(row["seed_target"]),
    status: String(row["status"]),
    eventCount: Number(row["event_count"]),
  }));
}

export async function readScanEvents(database: Database, scanGuid: string): Promise<ScanEvent[]> {
  const rows = await database.query(READ_EVENTS_SQL, [scanGuid]);
  return rows.map((row) => ({
    hash: String(row["hash"]),
    type: String(row["type"]),
    kind: String(row["kind"]),
    data: String(row["data"] ?? ""),
    module: String(row["module"] ?? ""),
    confidence: Number(row["confidence"]),
    generatedAtSeconds: Number(row["generated"]),
    falsePositive: Number(row["false_positive"]) === 1,
    parentHash: String(row["source_event_hash"]),
  }));
}
