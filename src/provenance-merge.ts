import type { ItemProvenance } from "./import-payload.ts";

// Joins the provenance of two events that the reader sends as ONE item (a relation reported twice, the
// values of one set found in several events). The item has to speak for all of them:
// - `recordRefs` lists the references of both, each once, so the item points to every event behind it;
// - `confidence` is the lowest of the two, the conservative reading;
// - `observedAt` is the latest, since a set is only complete when its last event exists.
// Every other field (the module) is the same for events that are joined, so the first one is kept.
export function mergeProvenance(first: ItemProvenance, second: ItemProvenance): ItemProvenance {
  const recordRefs = [...new Set([...(first.recordRefs ?? []), ...(second.recordRefs ?? [])])];
  const confidence = pick(Math.min, first.confidence, second.confidence);
  const observedAt = pick(Math.max, first.observedAt, second.observedAt);

  return {
    ...first,
    ...(recordRefs.length > 0 && { recordRefs }),
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
