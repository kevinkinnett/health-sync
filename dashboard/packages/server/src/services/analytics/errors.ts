/** Raised when an analytics request targets an item that does not exist. */
export class AnalyticsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsNotFoundError";
  }
}
