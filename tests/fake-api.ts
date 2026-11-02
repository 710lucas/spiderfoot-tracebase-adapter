import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeApi {
  url: string;
  receivedBodies: unknown[];
  close(): Promise<void>;
}

// A stand-in for the import API: answers every POST with the next status of `statuses` (the last
// one repeats) and records what it received.
export async function startFakeApi(statuses: number[] = [202]): Promise<FakeApi> {
  const receivedBodies: unknown[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      receivedBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const status = statuses[Math.min(receivedBodies.length, statuses.length) - 1] as number;
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    receivedBodies,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
