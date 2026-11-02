import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultLocalDatabasePath, openLocalDatabase } from "../src/local-database.ts";
import { ReaderError } from "../src/reader-error.ts";
import { listScans, readScanEvents } from "../src/scan-reader.ts";

let directory: string;
let databasePath: string;

before(() => {
  directory = mkdtempSync(join(tmpdir(), "spiderfoot-reader-"));
  databasePath = join(directory, "spiderfoot.db");
  // The slice of SpiderFoot's schema the reader uses.
  const connection = new DatabaseSync(databasePath);
  connection.exec(`
    CREATE TABLE tbl_scan_instance (guid VARCHAR PRIMARY KEY, name VARCHAR, seed_target VARCHAR,
      created INT, started INT, ended INT, status VARCHAR);
    CREATE TABLE tbl_event_types (event VARCHAR PRIMARY KEY, event_descr VARCHAR, event_raw INT,
      event_type VARCHAR);
    CREATE TABLE tbl_scan_results (scan_instance_id VARCHAR, hash VARCHAR, type VARCHAR,
      generated INT, confidence INT, visibility INT, risk INT, module VARCHAR, data VARCHAR,
      false_positive INT, source_event_hash VARCHAR);
    INSERT INTO tbl_scan_instance VALUES ('scan-1', 'first', 'example.com', 1, 1, 2, 'FINISHED');
    INSERT INTO tbl_scan_instance VALUES ('scan-2', 'second', 'other.org', 2, 2, 3, 'RUNNING');
    INSERT INTO tbl_event_types VALUES ('ROOT', 'Root', 1, 'INTERNAL');
    INSERT INTO tbl_event_types VALUES ('IP_ADDRESS', 'IP Address', 0, 'ENTITY');
    INSERT INTO tbl_scan_results VALUES ('scan-1', 'ROOT', 'ROOT', 1, 100, 100, 0, '', 'example.com', 0, 'ROOT');
    INSERT INTO tbl_scan_results VALUES ('scan-1', 'h1', 'IP_ADDRESS', 1500.5, 90, 100, 0, 'sfp_dns', '1.1.1.1', 1, 'ROOT');
    INSERT INTO tbl_scan_results VALUES ('scan-2', 'h2', 'IP_ADDRESS', 1, 100, 100, 0, 'sfp_dns', '2.2.2.2', 0, 'ROOT');
  `);
  connection.close();
});

after(() => rmSync(directory, { recursive: true, force: true }));

test("lists the scans with how many events each has", async () => {
  const scans = await listScans(openLocalDatabase(databasePath));

  assert.deepEqual(scans, [
    { guid: "scan-1", name: "first", target: "example.com", status: "FINISHED", eventCount: 2 },
    { guid: "scan-2", name: "second", target: "other.org", status: "RUNNING", eventCount: 1 },
  ]);
});

test("reads the events of one scan with SpiderFoot's classification of each type", async () => {
  const events = await readScanEvents(openLocalDatabase(databasePath), "scan-1");

  assert.deepEqual(events, [
    {
      hash: "ROOT",
      type: "ROOT",
      kind: "INTERNAL",
      data: "example.com",
      module: "",
      confidence: 100,
      generatedAtSeconds: 1,
      falsePositive: false,
      parentHash: "ROOT",
    },
    {
      hash: "h1",
      type: "IP_ADDRESS",
      kind: "ENTITY",
      data: "1.1.1.1",
      module: "sfp_dns",
      confidence: 90,
      generatedAtSeconds: 1500.5,
      falsePositive: true,
      parentHash: "ROOT",
    },
  ]);
});

test("a missing database file is reported with the way to point at the right one", () => {
  assert.throws(
    () => openLocalDatabase(join(directory, "missing.db")),
    (error: unknown) => error instanceof ReaderError && error.message.includes("--db"),
  );
});

test("a file that is not a usable database is reported as a reader error", async () => {
  const brokenPath = join(directory, "broken.db");
  new DatabaseSync(brokenPath).close();

  await assert.rejects(listScans(openLocalDatabase(brokenPath)), ReaderError);
});

test("the default location follows SPIDERFOOT_DATA, then the home folder", () => {
  assert.equal(defaultLocalDatabasePath({ SPIDERFOOT_DATA: "/data/sf" }), "/data/sf/spiderfoot.db");
  assert.match(defaultLocalDatabasePath({}), /\.spiderfoot\/spiderfoot\.db$/);
});
