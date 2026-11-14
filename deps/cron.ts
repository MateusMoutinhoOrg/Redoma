/** Scheduled jobs. No configuration: schedule at startup and it runs, deployed or local. */
export interface Cron {
  /**
   * Run `handler` when `expression` matches the time in UTC. Five fields:
   * minute, hour, day of month, month, day of week (0 = Sunday).
   *
   * Limits: an invalid expression throws at startup. A run that throws is
   * logged, not retried. Minutes missed while the app was down are not made
   * up. On Cloudflare's free plan a run gets 10 ms of CPU (waiting is free).
   * @example
   * cron.schedule("0 3 * * *", async () => {
   *   await db.query("DELETE FROM sessions WHERE expires_at < ?", Date.now());
   * });
   */
  schedule(expression: CronExamples | (string & {}), handler: () => void | Promise<void>): void;
}

export type CronExamples =
  | "* * * * *" // every minute
  | "*/15 * * * *" // every 15 minutes
  | "0 * * * *" // every hour
  | "0 3 * * *" // every day at 03:00 UTC
  | "0 9 * * 1-5"; // Monday to Friday at 09:00 UTC
