import type { Database } from "./database.ts";
import { openDockerDatabase } from "./docker-database.ts";
import { defaultLocalDatabasePath, openLocalDatabase } from "./local-database.ts";

// Where SpiderFoot runs, as the person chose it. Each mode finds the database on its own; the
// optional fields only override what would be found automatically.
export type DatabaseSource =
  { mode: "local"; databasePath?: string } | { mode: "docker"; container?: string };

export async function openDatabase(source: DatabaseSource): Promise<Database> {
  if (source.mode === "local") {
    return openLocalDatabase(source.databasePath ?? defaultLocalDatabasePath());
  }
  return openDockerDatabase(source.container);
}
