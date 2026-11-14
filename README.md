# spiderfoot-tracebase-adapter

A command line tool that reads [SpiderFoot](https://github.com/smicallef/spiderfoot) scans and sends them
to the import API of [tracebase](https://github.com/710lucas/tracebase), which stores them in a
knowledge graph.

It is a separate program from tracebase: it only needs the API's address. It is the SpiderFoot adapter
of an undergraduate thesis project, the first tool integrated through tracebase's import contract.

> The scans may hold personal data. The tracebase API has no authentication, so point this tool only at
> an API on a trusted, local network.

## Requirements

- Node.js 26. It runs the TypeScript directly and uses the built-in SQLite, so no `npm install` is
  needed to use it (`npm install` is only for development).
- A SpiderFoot installation with scans, either local (a `spiderfoot.db` file) or in a Docker container.
- A running tracebase API.

## Use

Say where SpiderFoot runs; the tool does the rest. The database is opened read-only and is never changed.

```bash
node src/main.ts list --mode docker
node src/main.ts scan <scan-id> --mode docker
```

```bash
node src/main.ts list --mode local
node src/main.ts scan <scan-id> --mode local --api http://localhost:3333
```

- `list` prints the scans (id, status, number of events, target, name).
- `scan <scan-id>` converts the scan and sends it to the API in batches. A warning appears if the scan
  has not finished.

| Option | Meaning |
|---|---|
| `--mode local\|docker` | Where SpiderFoot runs. Required. |
| `--db <path>` | local: the `spiderfoot.db` file. Default: `$SPIDERFOOT_DATA` or `~/.spiderfoot`. |
| `--container <name>` | docker: the SpiderFoot container. Default: the only one found by `docker ps -a`. |
| `--api <url>` | The import API. Default: `$OSINT_API` or `http://localhost:3333`. |
| `--max-batch-bytes <n>` | Largest request body. Default 90000 (the API reads 100 KB by default). |

## How a scan becomes graph data

SpiderFoot stores a scan as a tree of events. Each event has a type, a value, the module that found it, a
confidence, a time and the event that originated it. The tool uses the classification that SpiderFoot's
own database already holds for each event type:

- Events classified as entity or sub-entity become entities. Each one is linked, by a relation, to the
  closest entity above it in the tree.
- Events classified as descriptor or data become attributes of that entity. The event type is the
  attribute name, the text is the value, and the module is the qualifier.
- Repeated reports of the same relation by the same module are joined into one relation that lists the
  hash of every event behind it (`recordRefs`).
- The batch header names the tool (`spiderfoot`) and the run (the scan id), and each item keeps the
  module, confidence and time that SpiderFoot recorded.
- SpiderFoot does not name the link between two events, so every relation is sent without a type and
  tracebase stores it with the generic label `RELATED`.

Events marked as false positives are left out.

## Development

```bash
npm install
npm run check
```

`npm run check` runs the type check, the linter, the format check, the architecture rules and the tests
with a 90% coverage threshold.
