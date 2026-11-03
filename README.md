# spiderfoot-reader

Sends [SpiderFoot](https://github.com/smicallef/spiderfoot) scans to the OSINT graph import API
(`tracebase`). A separate program: it only needs the API's address.

Requires Node 26 (it runs the TypeScript directly and uses the built-in SQLite). No `npm install` is
needed to use it; `npm install` is only for development.

## Use

You only say where SpiderFoot runs.

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

How it reads, how events become graph data and what to watch out for: [`docs/README.md`](docs/README.md).
For the AI: `CLAUDE.md` and `.claude/`.

## Development

```bash
npm install
npm run check
```
