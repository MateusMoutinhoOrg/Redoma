import type { Deps } from "../deps/index.ts";

// The example app: a link shortener that never outgrows its database, because
// its links are spread over many small ones (up to 36 × 36 of them).
//
// A short code looks like "k3x9ab". Its first two characters name the database
// that keeps it ("links-k3"), so opening a link is always one query to one
// small database, however many links exist. The link databases share nothing:
// no index, no list of them.
//
// One thing is shared, on purpose: a single database, "redirect-count", counts
// every redirect, so the page can show a real number. Every visit writes to
// it, which makes it the one part that does not scale sideways. A redirect
// therefore never depends on it: if the count cannot be saved, the visitor is
// redirected anyway.

const LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789";
const LINKS_PER_HOUR = 20;

export default function main({ server, databases }: Deps) {
  /** The database that keeps this code. Opening one that does not exist creates it. */
  function databaseOf(code: string) {
    return databases.open(`links-${code.slice(0, 2)}`, [
      "CREATE TABLE links (code TEXT PRIMARY KEY, url TEXT NOT NULL, created_at INTEGER NOT NULL)",
    ]);
  }

  /** Counts one more link for this visitor and returns their total this hour. */
  async function countLink(visitor: string): Promise<number> {
    const db = databases.open(`visitor-${visitor}`, [
      "CREATE TABLE hours (hour INTEGER PRIMARY KEY, links INTEGER NOT NULL)",
    ]);
    const hour = Math.floor(Date.now() / 3_600_000);
    const [row] = await db.query<{ links: number }>(
      "INSERT INTO hours (hour, links) VALUES (?, 1) ON CONFLICT (hour) DO UPDATE SET links = links + 1 RETURNING links",
      hour,
    );
    return row.links;
  }

  /** The one database that counts redirects. It holds a single row. */
  function redirectCount() {
    return databases.open("redirect-count", [
      "CREATE TABLE redirects (id INTEGER PRIMARY KEY CHECK (id = 1), total INTEGER NOT NULL)",
    ]);
  }

  server.route("GET", "/api/stats", async () => {
    const [row] = await redirectCount().query<{ total: number }>("SELECT total FROM redirects WHERE id = 1");
    return Response.json({ redirects: row?.total ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  });

  server.route("POST", "/api/links", async (request) => {
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    const url = webAddress(body?.url);
    if (!url) return Response.json({ error: "Enter a web address that starts with http:// or https://." }, { status: 400 });

    const visitor = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if ((await countLink(visitor)) > LINKS_PER_HOUR) {
      return Response.json({ error: "That is a lot of links. Try again in an hour." }, { status: 429 });
    }

    // Two links may draw the same code. The database refuses the second one
    // (the code is its primary key), and we simply draw again.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const saved = await databaseOf(code).query(
        "INSERT OR IGNORE INTO links (code, url, created_at) VALUES (?, ?, ?) RETURNING code",
        code, url, Date.now(),
      );
      if (saved.length > 0) return Response.json({ code, url, database: `links-${code.slice(0, 2)}` }, { status: 201 });
    }
    return Response.json({ error: "Could not find a free code. Try again." }, { status: 503 });
  });

  // Files in public/ win over this route, so "/" is still the page.
  server.route("GET", "/:code", async (_request, { code }) => {
    if (!/^[a-z0-9]{6}$/.test(code)) return new Response("Link not found.", { status: 404 });
    const [link] = await databaseOf(code).query<{ url: string }>("SELECT url FROM links WHERE code = ?", code);
    if (!link) return new Response("Link not found.", { status: 404 });

    // Counting must never cost a visitor their redirect, so a failure is only logged.
    await redirectCount()
      .query("INSERT INTO redirects (id, total) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET total = total + 1")
      .catch((error) => console.error("Could not count a redirect:", error));
    return Response.redirect(link.url, 302);
  });
}

/** Six random characters: 2 billion possible codes. */
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => LETTERS[byte % LETTERS.length]).join("");
}

/** The address, tidied up, if it is an http(s) one a browser can open. Otherwise null. */
function webAddress(text: unknown): string | null {
  if (typeof text !== "string" || text.length > 2000 || !URL.canParse(text)) return null;
  const url = new URL(text);
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}
