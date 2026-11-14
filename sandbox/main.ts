import type { Deps } from "../deps/index.ts";

// The example app: one page (public/index.html), one API route, one table.
export default function main({ server, databases }: Deps) {
  const db = databases.open("main", [
    "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL)",
  ]);

  server.route("GET", "/api/notes", async () => {
    return Response.json(await db.query("SELECT id, text FROM notes ORDER BY id DESC"));
  });

  server.route("POST", "/api/notes", async (request) => {
    const { text } = (await request.json()) as { text?: string };
    if (!text?.trim()) return Response.json({ error: "text is required" }, { status: 400 });
    const [note] = await db.query("INSERT INTO notes (text) VALUES (?) RETURNING id, text", text.trim());
    return Response.json(note, { status: 201 });
  });
}
