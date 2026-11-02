import type { AttributePayload, ImportPayload, RelationPayload } from "./import-payload.ts";
import { ReaderError } from "./reader-error.ts";

export const TOOL_NAME = "spiderfoot";
const IMPORTS_PATH = "/imports";
const ACCEPTED_STATUS = 202;
const SEPARATOR_BYTES = 1;
const MAX_REJECTION_TEXT_LENGTH = 200;

export interface SendSummary {
  acceptedBatches: number;
  rejections: string[];
}

// A scan can have tens of thousands of items and the API reads a limited body per request, so the
// scan goes in several batches, each up to `maxBatchBytes` of JSON. Every batch carries the same
// `run`, which is what ties them to one scan.
export function buildBatches(
  scanGuid: string,
  relations: RelationPayload[],
  attributes: AttributePayload[],
  maxBatchBytes: number,
): ImportPayload[] {
  const source = { tool: TOOL_NAME, run: scanGuid };
  const envelopeBytes = jsonBytes({ source, relations: [], attributes: [] });
  return [
    ...splitBySize(relations, envelopeBytes, maxBatchBytes).map((slice) => ({
      source,
      relations: slice,
      attributes: [],
    })),
    ...splitBySize(attributes, envelopeBytes, maxBatchBytes).map((slice) => ({
      source,
      relations: [],
      attributes: slice,
    })),
  ];
}

// Sends the batches one after the other. A batch the API rejects (400) is recorded and the rest keep
// going; an API that cannot be reached stops everything, since nothing else would get through.
export async function sendBatches(
  apiUrl: string,
  batches: ImportPayload[],
  onBatchSent: (batchNumber: number, batchCount: number) => void = () => {},
): Promise<SendSummary> {
  const summary: SendSummary = { acceptedBatches: 0, rejections: [] };
  for (const [index, batch] of batches.entries()) {
    const response = await postBatch(apiUrl, batch);
    if (response.status === ACCEPTED_STATUS) {
      summary.acceptedBatches++;
    } else {
      summary.rejections.push(`batch ${index + 1}: ${await describeRejection(response)}`);
    }
    onBatchSent(index + 1, batches.length);
  }
  return summary;
}

async function postBatch(apiUrl: string, batch: ImportPayload): Promise<Response> {
  try {
    return await fetch(new URL(IMPORTS_PATH, apiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
  } catch (error) {
    const cause = (error as Error).cause as Error | undefined;
    const reason = cause?.message ?? (error as Error).message;
    throw new ReaderError(`could not reach the API at ${apiUrl}: ${reason}`);
  }
}

async function describeRejection(response: Response): Promise<string> {
  const text = (await response.text()).slice(0, MAX_REJECTION_TEXT_LENGTH);
  return `HTTP ${response.status} ${text}`;
}

// Groups items so each group, once wrapped in the envelope, stays within `maxBytes`. An item that is
// alone too big still gets its own group; the API will say so.
function splitBySize<Item>(items: Item[], envelopeBytes: number, maxBytes: number): Item[][] {
  const groups: Item[][] = [];
  let current: Item[] = [];
  let currentBytes = envelopeBytes;
  for (const item of items) {
    const itemBytes = jsonBytes(item) + SEPARATOR_BYTES;
    if (current.length > 0 && currentBytes + itemBytes > maxBytes) {
      groups.push(current);
      current = [];
      currentBytes = envelopeBytes;
    }
    current.push(item);
    currentBytes += itemBytes;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}
