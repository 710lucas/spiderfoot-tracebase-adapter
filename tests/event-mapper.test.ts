import { test } from "node:test";
import assert from "node:assert/strict";
import { mapScanEvents } from "../src/event-mapper.ts";
import type { ScanEvent } from "../src/scan-reader.ts";

function event(overrides: Partial<ScanEvent>): ScanEvent {
  return {
    hash: "hash",
    type: "TYPE",
    kind: "ENTITY",
    data: "data",
    module: "sfp_module",
    confidence: 100,
    generatedAtSeconds: 1000.4,
    falsePositive: false,
    parentHash: "ROOT",
    ...overrides,
  };
}

const root = event({ hash: "ROOT", type: "ROOT", kind: "INTERNAL", data: "example.com" });

test("an entity found from the scan target becomes a relation from the target", () => {
  const found = event({ hash: "a", type: "IP_ADDRESS", data: "93.184.216.34", parentHash: "ROOT" });

  const mapped = mapScanEvents([root, found]);

  assert.deepEqual(mapped.relations, [
    {
      source: { type: "INTERNET_NAME", value: "example.com" },
      target: { type: "IP_ADDRESS", value: "93.184.216.34" },
      provenance: {
        recordRef: "a",
        module: "sfp_module",
        confidence: 100,
        observedAt: 1000400,
      },
    },
  ]);
  assert.deepEqual(mapped.attributes, []);
});

test("an entity found from another entity becomes a relation between the two", () => {
  const ip = event({ hash: "ip", type: "IP_ADDRESS", data: "1.1.1.1" });
  const owner = event({ hash: "owner", type: "COMPANY_NAME", data: "Acme", parentHash: "ip" });

  const mapped = mapScanEvents([root, ip, owner]);

  assert.deepEqual(mapped.relations[1]?.source, { type: "IP_ADDRESS", value: "1.1.1.1" });
  assert.deepEqual(mapped.relations[1]?.target, { type: "COMPANY_NAME", value: "Acme" });
});

test("subentity events are treated as entities", () => {
  const link = event({ hash: "l", type: "LINKED_URL_INTERNAL", kind: "SUBENTITY" });

  assert.equal(mapScanEvents([root, link]).relations.length, 1);
});

test("descriptor and data events become attributes of the entity above them", () => {
  const ip = event({ hash: "ip", type: "IP_ADDRESS", data: "1.1.1.1" });
  const banner = event({
    hash: "b",
    type: "WEBSERVER_BANNER",
    kind: "DATA",
    data: "nginx",
    parentHash: "ip",
  });
  const header = event({
    hash: "h",
    type: "WEBSERVER_STRANGEHEADER",
    kind: "DESCRIPTOR",
    data: "x-powered-by",
    parentHash: "b",
  });

  const mapped = mapScanEvents([root, ip, banner, header]);

  assert.deepEqual(
    mapped.attributes.map(({ entity, name, values }) => ({ entity, name, values })),
    [
      {
        entity: { type: "IP_ADDRESS", value: "1.1.1.1" },
        name: "WEBSERVER_BANNER",
        values: ["nginx"],
      },
      {
        entity: { type: "IP_ADDRESS", value: "1.1.1.1" },
        name: "WEBSERVER_STRANGEHEADER",
        values: ["x-powered-by"],
      },
    ],
  );
});

test("an entity found under an attribute hangs from the entity above the attribute", () => {
  const ip = event({ hash: "ip", type: "IP_ADDRESS", data: "1.1.1.1" });
  const banner = event({
    hash: "b",
    type: "BANNER",
    kind: "DATA",
    data: "nginx",
    parentHash: "ip",
  });
  const found = event({ hash: "f", type: "VULNERABILITY", data: "CVE-1", parentHash: "b" });

  const mapped = mapScanEvents([root, ip, banner, found]);

  assert.deepEqual(mapped.relations[1]?.source, { type: "IP_ADDRESS", value: "1.1.1.1" });
});

test("the url tags of SpiderFoot are removed and a blank module is left out", () => {
  const link = event({ data: "<SFURL>https://example.com/a</SFURL>", module: "" });

  const mapped = mapScanEvents([root, link]);

  assert.equal(mapped.relations[0]?.target.value, "https://example.com/a");
  assert.equal(mapped.relations[0]?.provenance.module, undefined);
});

test("false positives are counted and not sent", () => {
  const mapped = mapScanEvents([root, event({ falsePositive: true })]);

  assert.deepEqual(
    { relations: mapped.relations.length, falsePositives: mapped.falsePositives },
    { relations: 0, falsePositives: 1 },
  );
});

test("events with blank data, a missing parent or a cyclic chain are counted as without entity", () => {
  const blank = event({ hash: "blank", data: " " });
  const orphan = event({ hash: "orphan", parentHash: "missing" });
  const cycleA = event({ hash: "a", kind: "DATA", parentHash: "b" });
  const cycleB = event({ hash: "b", kind: "DATA", parentHash: "a" });

  const mapped = mapScanEvents([root, blank, orphan, cycleA, cycleB]);

  assert.deepEqual(
    { relations: mapped.relations.length, withoutEntity: mapped.withoutEntity },
    { relations: 0, withoutEntity: 4 },
  );
});

test("a parent entity with blank data leaves its children without an entity", () => {
  const blankParent = event({ hash: "p", data: "" });
  const child = event({ hash: "c", parentHash: "p" });

  assert.equal(mapScanEvents([root, blankParent, child]).withoutEntity, 2);
});

const TARGET_TYPES: [string, string][] = [
  ["93.184.216.34", "IP_ADDRESS"],
  ["10.0.0.0/8", "NETBLOCK_OWNER"],
  ["someone@example.com", "EMAILADDR"],
  ["+5583999999999", "PHONE_NUMBER"],
  ['"Ada Lovelace"', "HUMAN_NAME"],
  ['"ada"', "USERNAME"],
  ["15169", "BGP_AS_OWNER"],
  ["example.com", "INTERNET_NAME"],
  ["710lucas", "ROOT"],
];

for (const [target, expectedType] of TARGET_TYPES) {
  test(`the scan target ${target} is typed ${expectedType}`, () => {
    const seed = event({ hash: "ROOT", type: "ROOT", kind: "INTERNAL", data: target });

    const mapped = mapScanEvents([seed, event({ parentHash: "ROOT" })]);

    assert.equal(mapped.relations[0]?.source.type, expectedType);
  });
}

// What the events of one observation look like in SpiderFoot: several events of the same type, module and
// parent. They are found together, so they are one attribute.
function headersUnder(parent: string, ...data: string[]) {
  return data.map((value, index) =>
    event({
      hash: `header-${parent}-${index}`,
      type: "WEBSERVER_STRANGEHEADER",
      kind: "DESCRIPTOR",
      data: value,
      module: "sfp_strangeheaders",
      parentHash: parent,
    }),
  );
}

const url = event({
  hash: "url",
  type: "LINKED_URL_INTERNAL",
  data: "http://x/",
  parentHash: "ROOT",
});

test("events of one type and module under one parent become a single attribute with all the values", () => {
  const mapped = mapScanEvents([
    root,
    url,
    ...headersUnder("url", "x-runtime: 0.2", "x-cache: Miss", "x-request-queueing: 0"),
  ]);

  assert.equal(mapped.attributes.length, 1);
  assert.deepEqual(mapped.attributes[0]?.entity, {
    type: "LINKED_URL_INTERNAL",
    value: "http://x/",
  });
  assert.equal(mapped.attributes[0]?.name, "WEBSERVER_STRANGEHEADER");
  assert.deepEqual(mapped.attributes[0]?.values, [
    "x-runtime: 0.2",
    "x-cache: Miss",
    "x-request-queueing: 0",
  ]);
});

test("the recordRef of the attribute is the parent event, where the values were found", () => {
  const mapped = mapScanEvents([root, url, ...headersUnder("url", "a: 1", "b: 2")]);

  assert.equal(mapped.attributes[0]?.provenance.recordRef, "url");
});

test("a different parent, type or module is a different attribute", () => {
  const content = event({
    hash: "content",
    type: "TARGET_WEB_CONTENT",
    kind: "DATA",
    data: "<html>",
    parentHash: "url",
  });
  const otherType = event({
    hash: "hash-1",
    type: "HASH",
    kind: "DESCRIPTOR",
    data: "[MD5] 1",
    parentHash: "content",
  });
  const otherModule = event({
    ...headersUnder("url", "a: 1")[0]!,
    hash: "from-other-module",
    module: "sfp_other",
  });

  const mapped = mapScanEvents([
    root,
    url,
    content,
    otherType,
    ...headersUnder("url", "a: 1"),
    otherModule,
    ...headersUnder("content", "b: 2"),
  ]);

  // content (parent url), HASH (parent content), headers from sfp_strangeheaders under url, the same
  // header from sfp_other under url, and headers under content: five groups.
  assert.equal(mapped.attributes.length, 5);
});

test("a repeated value is kept once and a blank one is counted and left out", () => {
  const mapped = mapScanEvents([root, url, ...headersUnder("url", "a: 1", "a: 1", "  ", "b: 2")]);

  assert.deepEqual(mapped.attributes[0]?.values, ["a: 1", "b: 2"]);
  assert.equal(mapped.withoutEntity, 1);
});

test("a group whose values are all blank sends no attribute", () => {
  const mapped = mapScanEvents([root, url, ...headersUnder("url", " ", "")]);

  assert.deepEqual(mapped.attributes, []);
  assert.equal(mapped.withoutEntity, 2);
});

test("a group takes the lowest confidence and the latest observation of its events", () => {
  const [first, second] = headersUnder("url", "a: 1", "b: 2") as [ScanEvent, ScanEvent];

  const mapped = mapScanEvents([
    root,
    url,
    { ...first, confidence: 90, generatedAtSeconds: 1000.4 },
    { ...second, confidence: 70, generatedAtSeconds: 1002.6 },
  ]);

  assert.equal(mapped.attributes[0]?.provenance.confidence, 70);
  assert.equal(mapped.attributes[0]?.provenance.observedAt, 1002600);
});

test("a false positive does not join its group", () => {
  const [first, second] = headersUnder("url", "a: 1", "b: 2") as [ScanEvent, ScanEvent];

  const mapped = mapScanEvents([root, url, first, { ...second, falsePositive: true }]);

  assert.deepEqual(mapped.attributes[0]?.values, ["a: 1"]);
  assert.equal(mapped.falsePositives, 1);
});
