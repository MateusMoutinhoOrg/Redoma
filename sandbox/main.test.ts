import type { Tests } from "../deps/testing.ts";

export default function ({ test, assert }: Tests) {
  test("saves a note and lists it", async (app) => {
    const created = await app.fetch("/api/notes", { method: "POST", body: JSON.stringify({ text: "hello" }) });
    assert.equal(created.status, 201);
    assert.equal(await created.json(), { id: 1, text: "hello" });

    const listed = await app.fetch("/api/notes");
    assert.equal(await listed.json(), [{ id: 1, text: "hello" }]);
  });
}
