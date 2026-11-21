// Giving the project its name. The name is stored in package.json and repeated
// in the Worker config, package-lock.json and the heading of AGENTS.md.
// `npm run rename` changes it; `npm run update` re-applies it to the fresh
// copies of those files.
//
// README.md belongs to the project. The only time it is written here is the
// first rename, while it is still the template's own presentation page: it is
// swapped for a starting page, and never touched again.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "./analyze.ts";
import { ROOT } from "./cli.ts";
import { syncDeployConfig } from "./config.ts";
import { TEMPLATE_NAME, readPackage, writePackage } from "./project.ts";

/** Present in README.md only while it is still the template's own presentation page. */
const TEMPLATE_README = "<!-- redoma:template-readme";
const TEMPLATE_HOME = "https://github.com/MateusMoutinhoOrg/Redoma";

/** Write `name` everywhere the project is named. Safe to run again with the same name. */
export async function applyName(name: string): Promise<void> {
  const pkg = readPackage();
  if (pkg.name !== name) {
    pkg.name = name;
    writePackage(pkg);
  }

  const lockPath = join(ROOT, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { name?: string; packages?: Record<string, { name?: string }> };
    if (lock.name !== name || lock.packages?.[""]?.name !== name) {
      lock.name = name;
      if (lock.packages?.[""]) lock.packages[""].name = name;
      writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    }
  }

  const { uses } = await analyze({ types: false, tools: false, restricted: false });
  syncDeployConfig(name, uses, true);

  const readme = join(ROOT, "README.md");
  if (name !== TEMPLATE_NAME && existsSync(readme) && readFileSync(readme, "utf8").includes(TEMPLATE_README)) {
    writeFileSync(readme, starterReadme(name));
  }

  const agents = join(ROOT, "AGENTS.md");
  if (existsSync(agents)) {
    const text = readFileSync(agents, "utf8");
    const title = name === TEMPLATE_NAME ? "# Redoma" : `# ${name}`;
    if (text.startsWith("# ")) writeFileSync(agents, title + text.slice(text.indexOf("\n")));
  }
}

/** The README a project starts with: a title and a pointer to the manual. From here on the file is the project's. */
export function starterReadme(name: string, about = ""): string {
  const own = about.trim() === "" ? "" : `${about.trim()}\n\n`;
  return `# ${name}\n\n${own}Built with [Redoma](${TEMPLATE_HOME}), a TypeScript template for Cloudflare Workers and Linux that keeps the app in a sandbox. The manual for the commands is in [REDOMA.md](REDOMA.md).\n`;
}
