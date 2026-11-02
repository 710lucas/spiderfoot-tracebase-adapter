import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Database, Row } from "./database.ts";
import { ReaderError } from "./reader-error.ts";

const DATABASE_FILE_NAME = "spiderfoot.db";
const DEFAULT_DATA_DIRECTORY_NAME = ".spiderfoot";

// SpiderFoot keeps its data in `$SPIDERFOOT_DATA`, or in `~/.spiderfoot` when that is not set.
export function defaultLocalDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
  const dataDirectory =
    environment["SPIDERFOOT_DATA"] ?? join(homedir(), DEFAULT_DATA_DIRECTORY_NAME);
  return join(dataDirectory, DATABASE_FILE_NAME);
}

// Opens the database read-only, so reading a scan can never change the user's SpiderFoot data.
export function openLocalDatabase(databasePath: string): Database {
  if (!existsSync(databasePath)) {
    throw new ReaderError(
      `SpiderFoot database not found at ${databasePath}. Use --db <path> to point at it.`,
    );
  }
  const connection = new DatabaseSync(databasePath, { readOnly: true });
  return {
    query: async (sql, parameters = []) => {
      try {
        return connection.prepare(sql).all(...parameters) as Row[];
      } catch (error) {
        throw new ReaderError(`could not read ${databasePath}: ${(error as Error).message}`);
      }
    },
  };
}
