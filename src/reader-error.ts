// A problem the person running the tool can fix (wrong option, database not found, API down). The
// entry point prints its message and exits; any other error is a bug and keeps its stack trace.
export class ReaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReaderError";
  }
}
