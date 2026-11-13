# Prompt: Redoma, a TypeScript Cloudflare template built for vibecoding

## What you are building

Build **Redoma**, a project template for writing a web server in TypeScript that runs on Cloudflare Workers. "Redoma" is Portuguese for a glass bell jar: everything inside is visible, and nothing gets in or out except through it. That is the design in one image, and the README can use it. Use the name as the default in `package.json`, the Worker name, the systemd unit names, the README, and `AGENTS.md`; `npm run rename` is what replaces it in a user's copy. It is published as a GitHub template repository: people create their own repo from it with "Use this template" (so it can be private and carries no fork link), rename it, and build their own app on top.

The architecture is a closed sandbox. The user's app lives in `sandbox/` and reaches the outside world only through a small set of capabilities declared in `deps/`. An `engine/` implements those capabilities on the platform and runs the app. The sandbox never needs to know which platform it is on.

The template is designed to be driven by AI coding agents on behalf of people who cannot program. Two readers matter, and every decision should serve both:

- **The agent.** It should be able to build a real feature after reading very little. Every file it must read costs tokens on every session, so the contract (`deps/`) has to be tiny, self-explanatory, and sufficient. The agent should almost never need to open `engine/`.
- **The beginner.** They have Node installed and nothing else. They run a handful of commands, read plain-language output, and never edit configuration by hand.

When a choice trades engine complexity for a smaller or clearer surface in `deps/`, `sandbox/`, or the command output, take the trade. Complexity belongs in the engine, where nobody reads it.

## Fixed decisions

These were settled with the project owner. Treat them as requirements.

1. **TypeScript only.** App, engine, and scripts are all `.ts`. No Python, no shell scripts, no build step for scripts. Node (22.18+ or 24) runs `.ts` files directly through type stripping, so the whole repo must use erasable syntax only (no enums, namespaces, or parameter properties) and explicit `.ts` import extensions. Configure `tsconfig` to enforce this.
2. **Node is the only prerequisite.** `npm install`, then `npm run dev`. Every script checks the Node version first and explains how to fix it if it is too old.
3. **Cloudflare Workers is the primary target.** The Worker runs the TypeScript natively, with no WASM or transpile-to-another-language layer. Local development uses the same runtime (workerd, through Wrangler/Miniflare).
   **There are two ways to publish, and both are first-class.** Many users never configure the CLI: they connect their GitHub repo to Cloudflare in the dashboard and let Cloudflare build and deploy on every push. Others run `npm run deploy` from a logged-in terminal. Nothing in the template may assume the CLI is logged in. A repo connected through the dashboard with default settings must deploy correctly, so whatever the deploy needs (bindings, cron trigger, restrict gates) has to come from committed config or from Wrangler's own build step, not from something only `npm run deploy` does.
4. **Linux self-hosting is required for compliance.** The same Worker runs on a Linux machine under workerd/Miniflare, managed by systemd, with all data on local disk. One engine implementation, not a second Node adapter.
5. **Four folders:** `sandbox/`, `deps/`, `engine/`, `scripts/`. Keep the repo root to the files tools force there (`package.json`, `tsconfig.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, license). Put everything else inside `engine/`. The Wrangler config goes there too only if a Git-connected deploy with default dashboard settings still finds it; otherwise it stays in the root.
6. **Documentation lives in `deps/` as TSDoc.** There is no `docs/` folder. The declarations are the docs.
7. **The sandbox is open by default and lockable on demand.** See "Restrict mode".
8. **Frontend is static files** in `sandbox/public/` (plain HTML/CSS/JS, no bundler), served automatically by the engine.
9. **The shipped example is minimal:** one page, one API route, one table, a few dozen lines. It exists so `npm run dev` shows something working. Richer usage examples belong in TSDoc.
10. **Minimal dependencies.** No runtime npm dependencies and no web framework. Dev dependencies are limited to what the platform requires (Wrangler, TypeScript, platform types).

## Layout and roles

```
sandbox/   The user's app. The only place an agent writes by default.
           main.ts exports the entry point, which receives `deps`.
           public/ holds the static frontend. Tests sit next to the code.
deps/      The contract: pure type declarations plus TSDoc. No logic.
engine/    The implementation of deps/ on Workers, the Worker entry,
           runtime config, the restrict checker, the Linux runner.
scripts/   One .ts file per user command, using only node: builtins.
```

The sandbox entry point is a single exported function that the engine calls once at startup, passing a single `deps` object (dependency injection). Inside it the app registers its routes and scheduled jobs. The sandbox imports types from `deps/`; a normal app needs no other import.

## The `deps/` contract

Design `deps/` before writing the engine; it is the product. Capabilities:

| Dep | Purpose |
|---|---|
| `server` | Register routes (with path parameters) and answer requests. |
| `http` | Make outbound HTTP calls. |
| `databases` | SQLite databases, created on first use by id. |
| `files` | Store and retrieve files/blobs (R2 on Cloudflare, disk on Linux). |
| `secrets` | Read a secret by name. Read-only. |
| `cron` | Run a function on a schedule. |

Design rules:

- **Reuse what models already know.** Use web-standard shapes (`Request`, `Response`, `Headers`, `URL`) wherever they fit, so the agent needs no new vocabulary. Invent API surface only where the platform has no standard.
- **One file per dep, plus an index** whose opening comment maps every capability in about ten lines. Reading the index alone should tell an agent which file to open.
- **Each exported symbol gets short TSDoc and one copy-pasteable example.**
- **Document real limitations at the symbol they affect.** Look for them deliberately: SQLite integers beyond ±2^53 losing precision as JavaScript numbers, anything that behaves differently under the local runtime than on Cloudflare (client-disconnect cancellation, client address, repeated headers), and whatever else you find while testing.
- **Databases take an ordered, append-only list of migration statements.** The engine records which ones have run and applies only the new ones. A single "creation query that runs once" is a trap for beginners who later change their schema; do not build that.
- **Databases need no setup.** Opening an id that does not exist creates it. The user never creates a resource in a dashboard or pastes an identifier into a config file.
- **Secrets fail helpfully.** Reading a missing secret produces an error that names the secret and both ways to provide it: the command for local use, and the dashboard path for a deployed Worker.
- **Cron needs zero configuration.** The sandbox calls something like `deps.cron.schedule("0 3 * * *", handler)` at startup and it works on Cloudflare and on Linux, with no config file to edit. One workable design is a single every-minute trigger with the engine matching expressions; on Linux the runner provides the tick. Document the timezone and give four or five common expressions in TSDoc.
- **Unused capabilities cost nothing.** A project that never touches `files` must deploy to an account that has not enabled R2.
- **Testing is part of the contract.** Sandbox tests must be able to exercise routes end to end against the local runtime while importing only from `deps/`.

There is no auth dep in this version. The example app therefore has no login, and the README must warn that anyone who can reach a deployed copy can use it.

## Commands

Every command is an npm script. The names below are fixed: use exactly these in `package.json`, the README, `AGENTS.md`, and every message a script prints. No command takes a flag, because `npm run x -- --flag` confuses beginners; variants get their own script name and options are positional arguments with sensible defaults.

There is no build command. Wrangler bundles the TypeScript during `dev` and `deploy`, and Node runs the scripts directly.

| Command | What it does |
|---|---|
| `npm run rename` | After creating a repo from the template, rename the project everywhere it is named (package, Worker, systemd units) in one step. |
| `npm run dev` | Run locally on the first free port from 3000 upward and print the URL. |
| `npm run test` | Type-check, run the restrict gates if enabled, run sandbox tests. The single command an agent runs before declaring work done. |
| `npm run deploy` | Compile, publish to Cloudflare, print the URL. Walk the user through login when needed; also accept an API token from the environment for unattended use. |
| `npm run deploy:check` | Compile and validate only; publish nothing. |
| `npm run secret set NAME` | Store a secret for local/Linux use (a git-ignored file) and, when the CLI is logged in, on Cloudflare too. |
| `npm run secret list` | Show secret names only, never values. |
| `npm run secret remove NAME` | Delete a secret. |
| `npm run restrict on` / `off` / `status` | See "Restrict mode". |
| `npm run update` | Bring the template's machinery up to date. See below. |
| `npm run service:install [PORT or FROM:TO]` | Install the app as a systemd service on a port, or on the first free port of a range (default 3000), restarting on failure and on boot. |
| `npm run service:remove` | Remove the service. |
| `npm run service:status` | Show whether it is running, the port, and recent log lines. |
| `npm run watcher:install [SECONDS]` | Install a watcher that checks the user's own repo remote at an interval (default 60), pulls new commits, and restarts the service. |
| `npm run watcher:remove` | Remove the watcher. |

**Secret values are read only from an interactive terminal prompt with hidden input**, never from arguments or piped stdin; when there is no TTY, `secret set` refuses and explains. This keeps values out of shell history and transcripts, and makes it mechanically impossible for an agent to set a secret through its shell tool.

**A secret lives in up to three places, and `secret set` must never leave the user guessing which ones it reached.** It always writes the local file. If the CLI is logged in, it also sends the secret to Cloudflare. If the CLI is not logged in, that is a normal situation, not an error: the script says the secret was saved locally only and prints the exact dashboard steps to add it to the deployed Worker by hand. A Linux server is a third place: the local file is git-ignored, so the secret has to be set on that machine as well, and the README says so. Confirm that secrets added in the dashboard survive later deploys from both publishing paths.

**`update` replaces `engine/`, `deps/`, `scripts/`, and the template-owned root files with the latest version of the upstream template, and never touches `sandbox/`.** A repo created with "Use this template" shares no git history with the template, so a merge is not available; the script fetches the template (its URL stored in project config) and copies those paths. It refuses to run when those paths have uncommitted changes, lists what changed, then runs the same checks as `test` and reports whether the user's sandbox still passes against the new `deps/`. It is a user action: it requires interactive confirmation, and when restrict mode is on it refreshes the record of protected files.

**Linux services.** Prefer user-level systemd units if that avoids `sudo`. If `sudo` is unavoidable, the commands that should never run as root must detect it and refuse, because root-owned files left in the project break every later command. Data persists in a project-local directory that the README names as the thing to back up.

Output conventions, because agents and beginners both read it: one line on success; on failure, say what went wrong, where (`file:line` when relevant), and the next step to take. No stack traces unless a verbose variant is used.

## Restrict mode

Off by default: the sandbox may import npm packages or anything else, and agents are merely instructed to stay in `sandbox/`. Locking is the user's decision.

`restrict on` persists the setting in the repo and enables three gates:

1. **Import gate.** `dev`, `test`, and `deploy` fail if any sandbox file imports something other than sandbox-relative paths or `deps/`. Also reject dynamic `import()`, `require`, `eval`, `new Function`, and reaching through `globalThis`/`self`.
2. **Type gate.** The sandbox is type-checked in a program where ambient runtime globals (`fetch`, `process`, bindings, and so on) do not exist. Only the ES library and what `deps/` declares or allow-lists are visible.
3. **Agent gate.** Generate Claude Code settings that deny edits to `engine/`, `deps/`, `scripts/`, root config, the agent settings themselves, and the restrict state, and deny running the `restrict`, `secret`, and `update` scripts.

`restrict off` requires interactive TTY confirmation, the same technique as `secret set`, so an agent cannot switch the lock off. `restrict status` also reports any protected file that changed since the lock was turned on.

Be honest in the README about what this is: a strong guardrail, not a security boundary. An agent with unrestricted shell access can still modify files outside Claude Code's edit tools, and other agents ignore Claude Code settings entirely (they are covered only by gates 1 and 2). Say so plainly and point to OS-level options for people who need more.

## Agent instructions

`AGENTS.md` is the single source of truth. `CLAUDE.md` should only import it (verify the current import syntax; duplicate the content only if importing is not possible). Keep `AGENTS.md` under about 60 lines; it is loaded into every session. It must cover:

- **What this repo is,** in two or three lines, and the four-folder map.
- **Reading order.** Read `deps/` first (its TSDoc is the API documentation), then `sandbox/`, then the README if the question is about commands. Open a file in `engine/` only after those have failed to answer the question, and then only the specific file needed. State the reason: the engine is implementation detail, and reading it spends tokens without changing what the sandbox can do.
- **Where to write.** `sandbox/` only, unless the user explicitly asks to change the template itself.
- **Secrets: always ask, never assume.** Never set, change, remove, or read secret values, and never ask the user to paste one into the chat. Whenever a task involves a secret, stop and ask the user before writing code that depends on it: explain what the secret is for, get explicit approval, and ask how they publish (Git connected in the Cloudflare dashboard, or `npm run deploy` from a terminal), because many users have no CLI configured and the steps differ. Then write the code that reads the secret and give the user the steps for their case: the local command, plus the dashboard steps if they publish through Git. Do not run or suggest CLI login on your own. The reason: beginners get lost when keys appear or change without their knowledge, and an app that works locally but fails once published because the secret only exists on their machine is the most common way that happens.
- **Finishing.** Run `npm run test` before reporting work as done. Deploy only when asked, and remember that for Git-connected users a push is a deploy. Never run `update`; it is the user's call.
- **Restrict mode.** If a gate blocks something, tell the user what was blocked and why instead of working around it.

## README

The README has two jobs: look like a serious, modern infrastructure project at first glance, and remain something a beginner can follow line by line.

**Look.** Give it the visual polish of a high-end developer tool: a centered header with a wordmark or small SVG mark built on the bell-jar idea, a one-line tagline, a restrained row of badges, a short "what you get" section, a clean diagram of how `sandbox/`, `deps/`, and `engine/` relate, and a quickstart block that takes three commands to a running app. Dark-and-light friendly, generous spacing, consistent heading rhythm, no emoji clutter. Make deliberate choices instead of copying the generic template look. Constraints:

- Every badge states something true and checkable (license, Node version, runtime). No badges for CI, coverage, or downloads that do not exist.
- Any image is an SVG committed inside `engine/` (the four-folder rule still holds) and must render on GitHub in both themes.
- The polish sits at the top. From the quickstart down, the page is plain Markdown, because agents read this file for commands and decorative HTML there costs tokens and hides the instructions.

**Content.** Written for the beginner, in plain language: what the template is, the four folders in one line each, the commands in the order a new user meets them (create a repo with "Use this template", install, rename, dev, test, publish, secrets, update, Linux service), both ways to publish with the Git-connected one explained click by click, where each secret has to be set for each way of running the app, where the data lives, what restrict mode does and does not guarantee, the no-login warning for the example, and the known limitations.

## Token budget

Treat tokens as a measured requirement. Target: everything an agent must read to build a typical feature (`AGENTS.md`, all of `deps/`, the example sandbox) totals roughly 3,000 tokens. Report the actual figure at the end, per file.

## Verify against current documentation

Several platform details change often and should be checked rather than recalled: Wrangler's current config format and whether the config can live in `engine/`; how Cloudflare's Git-connected builds work today (default build and deploy commands, where they look for config, how to run a check before deploying) and where secrets are added in the dashboard; which SQLite-backed storage works on the free plan, locally, and with no manual resource creation; how R2 buckets are provisioned and what an account needs before using R2; Cron Trigger limits; the supported way to run workerd/Miniflare as a long-lived service with on-disk persistence and scheduled events; the Node version where type stripping is on by default; and the current Claude Code settings, permission-rule, and `AGENTS.md`/`CLAUDE.md` syntax.

If a fixed decision above turns out to be infeasible on the current platform, stop and report the conflict with the alternatives you see, instead of quietly substituting a different design.

## Checking the work

Before reporting, confirm each of these by running it:

- The README renders correctly on GitHub in light and dark themes (check the rendered page, not only the Markdown source), and `npm run rename` leaves it coherent in a renamed copy.
- Fresh clone, `npm install`, `npm run dev`: the example page loads and its API route reads and writes the database.
- `npm run test` passes; `npm run deploy:check` passes.
- The command Cloudflare runs for a Git-connected deploy with default settings, executed in a clean checkout with no CLI login state and none of the npm scripts run first, produces a valid deployment (dry run). With restrict on, a forbidden import makes that same command fail.
- `secret set` with no CLI login saves locally, says so, and prints the dashboard steps; the app's missing-secret error names both ways to provide it.
- `npm run update`, pointed at a local copy of the template with a changed engine file, replaces the machinery, leaves `sandbox/` byte-for-byte unchanged, and refuses to run when protected paths have uncommitted changes.
- Each dep has at least one test that exercises it through the local runtime, including a cron job firing, a file round-trip, and a second migration applied to an existing database.
- With restrict on: a forbidden import in the sandbox fails `test` with a clear message; a forbidden global fails type-checking; `restrict off`, `secret set`, and `update` all refuse to run without a TTY.
- Linux service install, status, restart persistence, and remove, if the environment has systemd. If it does not, say so.
- **Test the harness itself.** If you can launch a fresh agent session or subagent, give it only the repo and ask for a small feature that uses `files` and `cron`. Check whether it succeeded without opening `engine/`. Where it had to, improve the TSDoc until it would not.

## Final report

Keep it short: what was built, what was verified and how, what could not be verified in this environment, any place you deviated from this prompt and why, and the measured token counts.