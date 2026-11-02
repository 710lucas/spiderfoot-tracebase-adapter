export type Row = Record<string, string | number | null>;

// What the reader needs from a SpiderFoot database: run a read-only query. Where the database lives
// (a file on this machine, a Docker volume) is hidden behind this.
export interface Database {
  query(sql: string, parameters?: string[]): Promise<Row[]>;
}
