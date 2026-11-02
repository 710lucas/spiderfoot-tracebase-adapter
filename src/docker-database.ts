import { spawn } from "node:child_process";
import type { Database, Row } from "./database.ts";
import { ReaderError } from "./reader-error.ts";

// Runs a command and returns what it printed. A parameter of `openDockerDatabase` so tests do not
// need Docker.
export type ProcessRunner = (command: string, args: string[]) => Promise<string>;

export const runProcess: ProcessRunner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args);
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) =>
      reject(new ReaderError(`could not run ${command}: ${error.message}`)),
    );
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(Buffer.concat(output).toString("utf8"));
        return;
      }
      reject(
        new ReaderError(`${command} failed: ${Buffer.concat(errors).toString("utf8").trim()}`),
      );
    });
  });

const DEFAULT_DATA_DIRECTORY = "/var/lib/spiderfoot";
const DATABASE_FILE_NAME = "spiderfoot.db";
const IMAGE_PYTHON = "/opt/venv/bin/python";

// Runs inside a throwaway container made from the SpiderFoot image, which already has Python and
// SQLite. It opens the database read-only, runs the query and prints one JSON object per row.
const QUERY_SCRIPT = `
import json, sqlite3, sys
database_path, sql, parameters = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
connection = sqlite3.connect("file:" + database_path + "?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
for row in connection.execute(sql, parameters):
    print(json.dumps(dict(row)))
`;

interface ContainerMount {
  Type: string;
  Name?: string;
  Source: string;
  Destination: string;
}

interface ContainerDescription {
  Config: { Image: string; Env: string[] | null };
  Mounts: ContainerMount[];
}

// Reads the database of a SpiderFoot container without starting it and without copying the database:
// the data volume is mounted read-only into a throwaway container that runs the query. With no
// container name given, it looks for the only SpiderFoot container on the machine.
export async function openDockerDatabase(
  containerName: string | undefined,
  run: ProcessRunner = runProcess,
): Promise<Database> {
  const container = containerName ?? (await findSpiderFootContainer(run));
  const description = await describeContainer(container, run);
  const dataDirectory = findDataDirectory(description);
  const mount = description.Mounts.find((candidate) => candidate.Destination === dataDirectory);
  if (mount === undefined) {
    throw new ReaderError(
      `container ${container} has no volume at ${dataDirectory}, so its scans are not persisted.`,
    );
  }
  const mountSource = mount.Type === "volume" ? (mount.Name ?? mount.Source) : mount.Source;
  const databasePath = `${dataDirectory}/${DATABASE_FILE_NAME}`;

  return {
    query: async (sql, parameters = []) => {
      const output = await run("docker", [
        "run",
        "--rm",
        "--entrypoint",
        IMAGE_PYTHON,
        "-v",
        `${mountSource}:${dataDirectory}:ro`,
        description.Config.Image,
        "-c",
        QUERY_SCRIPT,
        databasePath,
        sql,
        JSON.stringify(parameters),
      ]);
      return output
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as Row);
    },
  };
}

async function findSpiderFootContainer(run: ProcessRunner): Promise<string> {
  const output = await run("docker", ["ps", "-a", "--format", "{{.Names}}\t{{.Image}}"]);
  const names = output
    .split("\n")
    .filter((line) => line.toLowerCase().includes("spiderfoot"))
    .map((line) => line.split("\t")[0] ?? "");
  if (names.length === 1) {
    return names[0] as string;
  }
  if (names.length === 0) {
    throw new ReaderError("no SpiderFoot container found. Use --container <name>.");
  }
  throw new ReaderError(
    `more than one SpiderFoot container found (${names.join(", ")}). Use --container <name>.`,
  );
}

async function describeContainer(
  container: string,
  run: ProcessRunner,
): Promise<ContainerDescription> {
  try {
    const output = await run("docker", ["inspect", container]);
    return (JSON.parse(output) as ContainerDescription[])[0] as ContainerDescription;
  } catch (error) {
    throw new ReaderError(`could not inspect container ${container}: ${(error as Error).message}`);
  }
}

// The image sets `SPIDERFOOT_DATA`; that is where the container keeps its data.
function findDataDirectory(description: ContainerDescription): string {
  const variable = (description.Config.Env ?? []).find((entry) =>
    entry.startsWith("SPIDERFOOT_DATA="),
  );
  return variable?.slice("SPIDERFOOT_DATA=".length) ?? DEFAULT_DATA_DIRECTORY;
}
