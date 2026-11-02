import { buildBatches, sendBatches } from "./api-client.ts";
import type { CliCommand } from "./cli-options.ts";
import type { Database } from "./database.ts";
import { mapScanEvents } from "./event-mapper.ts";
import { ReaderError } from "./reader-error.ts";
import { listScans, readScanEvents } from "./scan-reader.ts";

const FINISHED_STATUS = "FINISHED";

export async function runCommand(database: Database, command: CliCommand): Promise<void> {
  if (command.name === "list") {
    await printScans(database);
  } else {
    await sendScan(database, command.scanId, command.apiUrl, command.maxBatchBytes);
  }
}

async function printScans(database: Database): Promise<void> {
  const scans = await listScans(database);
  if (scans.length === 0) {
    console.log("No scans found.");
    return;
  }
  console.log(["ID", "STATUS", "EVENTS", "TARGET", "NAME"].join("\t"));
  for (const scan of scans) {
    console.log([scan.guid, scan.status, scan.eventCount, scan.target, scan.name].join("\t"));
  }
}

async function sendScan(
  database: Database,
  scanId: string,
  apiUrl: string,
  maxBatchBytes: number,
): Promise<void> {
  const scan = (await listScans(database)).find((candidate) => candidate.guid === scanId);
  if (scan === undefined) {
    throw new ReaderError(`scan ${scanId} not found. Run "list" to see the available scans.`);
  }
  if (scan.status !== FINISHED_STATUS) {
    console.warn(`warning: the scan is ${scan.status}, so what is sent may be incomplete.`);
  }

  const mapped = mapScanEvents(await readScanEvents(database, scanId));
  console.log(
    `read ${scan.eventCount} events: ${mapped.relations.length} relations, ` +
      `${mapped.attributes.length} attributes ` +
      `(skipped: ${mapped.falsePositives} false positives, ${mapped.withoutEntity} without an entity)`,
  );

  const batches = buildBatches(scanId, mapped.relations, mapped.attributes, maxBatchBytes);
  const summary = await sendBatches(apiUrl, batches, (batchNumber, batchCount) =>
    console.log(`sent batch ${batchNumber}/${batchCount}`),
  );

  console.log(`done: ${summary.acceptedBatches}/${batches.length} batches accepted by ${apiUrl}`);
  for (const rejection of summary.rejections) {
    console.error(`rejected ${rejection}`);
  }
  if (summary.rejections.length > 0) {
    process.exitCode = 1;
  }
}
