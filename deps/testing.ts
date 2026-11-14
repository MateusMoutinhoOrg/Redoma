/**
 * Tests are `*.test.ts` files next to the code in `sandbox/`; `npm run test`
 * runs them against the real local runtime. A test file default-exports a
 * function that takes `Tests`: see `sandbox/main.test.ts`.
 */
export interface Tests {
  /** Each test gets its own app with empty databases and files. */
  test(name: string, run: (app: App) => void | Promise<void>): void;
  test(name: string, options: TestOptions, run: (app: App) => void | Promise<void>): void;
  /** `assert(value)` fails unless truthy. `assert.equal(a, b)` fails unless deeply equal. */
  assert: { (value: unknown, message?: string): void; equal(actual: unknown, expected: unknown, message?: string): void };
}

export interface TestOptions {
  /** What `secrets.get` returns in this test. Use made-up values. */
  secrets?: Record<string, string>;
  /**
   * Answers the app's `http.fetch` calls. Without it they fail: tests never
   * reach the network.
   * @example
   * test("shows the weather", { http: () => Response.json({ temp: 21 }) }, async (app) => {
   *   assert.equal(await (await app.fetch("/api/weather")).json(), { temp: 21 });
   * });
   */
  http?: (request: Request) => Response | Promise<Response>;
}

export interface App {
  /** Request a route or a file of `sandbox/public/`. Redirects are not followed. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /**
   * Run the cron jobs due at `time` and wait for them. Rejects if one throws.
   * @example
   * await app.runCron("2026-01-01T03:00:00Z"); // runs the "0 3 * * *" jobs
   */
  runCron(time: string | Date): Promise<void>;
}
