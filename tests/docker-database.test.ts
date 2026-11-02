import { test } from "node:test";
import assert from "node:assert/strict";
import { openDockerDatabase, runProcess, type ProcessRunner } from "../src/docker-database.ts";
import { ReaderError } from "../src/reader-error.ts";

interface RecordedCall {
  command: string;
  args: string[];
}

function inspectJson(overrides: { env?: string[]; mounts?: object[] } = {}): string {
  return JSON.stringify([
    {
      Config: {
        Image: "spiderfoot:latest",
        Env: overrides.env ?? ["SPIDERFOOT_DATA=/var/lib/spiderfoot"],
      },
      Mounts: overrides.mounts ?? [
        {
          Type: "volume",
          Name: "sf-data",
          Source: "/docker/volumes/sf-data",
          Destination: "/var/lib/spiderfoot",
        },
      ],
    },
  ]);
}

// A fake Docker: answers `ps`, `inspect` and `run` from the given texts and records every call.
function fakeDocker(answers: { ps?: string; inspect?: string; run?: string }) {
  const calls: RecordedCall[] = [];
  const run: ProcessRunner = async (command, args) => {
    calls.push({ command, args });
    const subcommand = args[0] as "ps" | "inspect" | "run";
    return answers[subcommand] ?? "";
  };
  return { calls, run };
}

test("with no container name it finds the only SpiderFoot container and queries its volume read-only", async () => {
  const docker = fakeDocker({
    ps: "spiderfoot\tspiderfoot\nredis\tredis:7\n",
    inspect: inspectJson(),
    run: '{"guid":"scan-1","event_count":3}\n{"guid":"scan-2","event_count":0}\n',
  });

  const database = await openDockerDatabase(undefined, docker.run);
  const rows = await database.query("SELECT 1 WHERE ? = ?", ["a", "b"]);

  assert.deepEqual(rows, [
    { guid: "scan-1", event_count: 3 },
    { guid: "scan-2", event_count: 0 },
  ]);
  const queryCall = docker.calls.at(-1) as RecordedCall;
  assert.deepEqual(queryCall.args.slice(0, 6), [
    "run",
    "--rm",
    "--entrypoint",
    "/opt/venv/bin/python",
    "-v",
    "sf-data:/var/lib/spiderfoot:ro",
  ]);
  assert.deepEqual(queryCall.args.slice(6, 7), ["spiderfoot:latest"]);
  assert.deepEqual(queryCall.args.slice(-3), [
    "/var/lib/spiderfoot/spiderfoot.db",
    "SELECT 1 WHERE ? = ?",
    '["a","b"]',
  ]);
});

test("an explicit container name skips the search", async () => {
  const docker = fakeDocker({ inspect: inspectJson() });

  await openDockerDatabase("my-sf", docker.run);

  assert.deepEqual(docker.calls, [{ command: "docker", args: ["inspect", "my-sf"] }]);
});

test("a bind mount is mounted by its host path", async () => {
  const docker = fakeDocker({
    inspect: inspectJson({
      mounts: [{ Type: "bind", Source: "/home/me/sf", Destination: "/var/lib/spiderfoot" }],
    }),
  });

  const database = await openDockerDatabase("sf", docker.run);
  await database.query("SELECT 1");

  assert.ok(
    (docker.calls.at(-1) as RecordedCall).args.includes("/home/me/sf:/var/lib/spiderfoot:ro"),
  );
});

test("the data directory comes from the container's SPIDERFOOT_DATA", async () => {
  const docker = fakeDocker({
    inspect: inspectJson({
      env: ["SPIDERFOOT_DATA=/data"],
      mounts: [{ Type: "volume", Name: "v", Source: "/x", Destination: "/data" }],
    }),
  });

  const database = await openDockerDatabase("sf", docker.run);
  await database.query("SELECT 1");

  assert.ok((docker.calls.at(-1) as RecordedCall).args.includes("/data/spiderfoot.db"));
});

test("a container with no environment falls back to the default data directory", async () => {
  const description = JSON.parse(inspectJson()) as { Config: { Env: string[] | null } }[];
  (description[0] as { Config: { Env: string[] | null } }).Config.Env = null;
  const docker = fakeDocker({ inspect: JSON.stringify(description) });

  await assert.doesNotReject(openDockerDatabase("sf", docker.run));
});

test("no SpiderFoot container is reported with the way to name one", async () => {
  const docker = fakeDocker({ ps: "redis\tredis:7\n" });

  await assert.rejects(
    openDockerDatabase(undefined, docker.run),
    (error: unknown) => error instanceof ReaderError && error.message.includes("--container"),
  );
});

test("more than one SpiderFoot container asks the person to choose", async () => {
  const docker = fakeDocker({ ps: "sf-one\tspiderfoot\nsf-two\tspiderfoot\n" });

  await assert.rejects(
    openDockerDatabase(undefined, docker.run),
    (error: unknown) => error instanceof ReaderError && error.message.includes("sf-one, sf-two"),
  );
});

test("a container without the data volume is reported", async () => {
  const docker = fakeDocker({ inspect: inspectJson({ mounts: [] }) });

  await assert.rejects(
    openDockerDatabase("sf", docker.run),
    (error: unknown) => error instanceof ReaderError && error.message.includes("not persisted"),
  );
});

test("a container Docker does not know is reported as a reader error", async () => {
  const failingRun: ProcessRunner = async () => {
    throw new ReaderError("docker failed: no such object");
  };

  await assert.rejects(openDockerDatabase("nope", failingRun), ReaderError);
});

test("runProcess returns what the command printed", async () => {
  assert.equal(await runProcess("node", ["-e", "process.stdout.write('hi')"]), "hi");
});

test("runProcess reports a failing command with its error output", async () => {
  await assert.rejects(
    runProcess("node", ["-e", "console.error('boom'); process.exit(3)"]),
    (error: unknown) => error instanceof ReaderError && error.message.includes("boom"),
  );
});

test("runProcess reports a command that does not exist", async () => {
  await assert.rejects(runProcess("definitely-not-a-command", []), ReaderError);
});
